import { z } from "zod";
import { generateJsonSafe } from "@/lib/ai";
import { connectToDatabase } from "@/lib/db";
import { loadUserContextSnapshot } from "@/lib/career/context";
import { CONTROL_ROOM_ANALYSIS_VERSION } from "@/lib/career/types";
import { loadOutcomeTelemetry } from "@/lib/career/telemetry";
import { slugify } from "@/lib/career/utils";
import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { GeneratedArtifactModel } from "@/lib/models/GeneratedArtifact";
import { JobEvaluationModel } from "@/lib/models/JobEvaluation";
import { JobLeadModel, type JobLead } from "@/lib/models/JobLead";
import { SearchCampaignModel } from "@/lib/models/SearchCampaign";
import { TailoringRunModel } from "@/lib/models/TailoringRun";

function serialize<T>(value: T): T {
  if (!value) return value;
  if (Array.isArray(value)) {
    return value.map((item) => serialize(item)) as T;
  }
  if (value && typeof value === "object") {
    const maybeDocument = value as unknown as { toObject?: () => T };
    if (typeof maybeDocument.toObject === "function") {
      return maybeDocument.toObject();
    }
  }
  return value;
}

type CandidateInfo = {
  company?: string;
  location?: string;
};

type DisplayInfo = {
  displayCompany: string;
  displayLocation: string;
};

const PLACEHOLDER_KEYWORDS = [
  "tbd",
  "unknown",
  "unknown company",
  "company tbd",
  "show more",
  "more info",
  "read more",
  "see more",
  "n/a",
  "apply now",
];

const COMPANY_PATTERNS = [
  /\bcompany(?: name)?[:\-]\s*(?<value>[^•\n\r,;]+)/i,
  /\bemployer(?: name)?[:\-]\s*(?<value>[^•\n\r,;]+)/i,
  /\bposted by\s+(?<value>[^•\n\r,;]+)/i,
  /\bwith\s+(?<value>[A-Z][\w&\.\- ]{2,}?)(?:\s+(?:is|seeks|offers|aims|looking|provides))/i,
];

const LOCATION_PATTERNS = [
  /\blocation[:\-]\s*(?<value>[^•\n\r,;]+)/i,
  /\bbased in\s+(?<value>[^•\n\r,;]+)/i,
  /\bloc(?:ated)? (?:in|at)\s+(?<value>[^•\n\r,;]+)/i,
  /\bcity[:\-]\s*(?<value>[^•\n\r,;]+)/i,
  /\bregion[:\-]\s*(?<value>[^•\n\r,;]+)/i,
];

const MAX_DESCRIPTION_CHARS = 3200;

function normalizeCandidate(value?: string): string | undefined {
  if (!value) return undefined;
  const collapsed = value
    .replace(/[\u2022•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return undefined;
  const cleaned = collapsed.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return undefined;
  if (PLACEHOLDER_KEYWORDS.some((keyword) => cleaned.includes(keyword))) return undefined;
  if (cleaned.length <= 1) return undefined;
  return collapsed;
}

function extractValueByPatterns(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (match.groups?.value) {
      const value = normalizeCandidate(match.groups.value);
      if (value) return value;
    }
    if (match[1]) {
      const value = normalizeCandidate(match[1]);
      if (value) return value;
    }
  }
  return undefined;
}

function matchFromSources(textSources: string[], patterns: RegExp[]): string | undefined {
  for (const rawText of textSources) {
    if (!rawText) continue;
    const match = extractValueByPatterns(rawText, patterns);
    if (match) return match;
  }
  return undefined;
}

function deriveDisplayCandidates(lead: JobLead, description: string): CandidateInfo {
  const descriptionText = description.trim();
  const candidateSources = [descriptionText, lead.snippet, lead.postedText, lead.title].filter(Boolean) as string[];
  const company =
    normalizeCandidate(lead.company) || matchFromSources(candidateSources, COMPANY_PATTERNS);
  const location =
    normalizeCandidate(lead.location) || matchFromSources(candidateSources, LOCATION_PATTERNS);
  return { company, location };
}

async function parseCompanyLocationWithAi(
  description: string,
): Promise<{ company?: string; location?: string }> {
  const snippet = description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_CHARS);
  if (!snippet) {
    return {};
  }
  const prompt = `Extract the hiring company and location from the following job description. Return only valid JSON with the keys "company" and "location". Use null when you cannot identify a field.
Description: ${JSON.stringify(snippet)}`;

  try {
    const parsed = await generateJsonSafe("easy", prompt, 1);
    return {
      company: typeof parsed.company === "string" ? parsed.company : undefined,
      location: typeof parsed.location === "string" ? parsed.location : undefined,
    };
  } catch {
    return {};
  }
}

// Motivation vs Logic:
// Motivation: We need reliable company/location labels so the control room never shows placeholders
// like "Show more" or "Unknown" during normal navigation.
// Logic: Normalize the raw fields, scan the job text with keywords/patterns, then fall back to AI
// (DEFAULT_EASY_MODEL via generateJsonSafe("easy", ...)) only when heuristics still leave gaps.
async function buildLeadDisplayInfo(lead: JobLead, options?: { allowAi?: boolean }): Promise<DisplayInfo> {
  const description = (lead.canonicalJobDescription || lead.snippet || "").trim();
  const { company, location } = deriveDisplayCandidates(lead, description);
  let resolvedCompany = company;
  let resolvedLocation = location;

  if (options?.allowAi && description && (!resolvedCompany || !resolvedLocation)) {
    const aiResult = await parseCompanyLocationWithAi(description);
    resolvedCompany ||= normalizeCandidate(aiResult.company);
    resolvedLocation ||= normalizeCandidate(aiResult.location);
  }

  return {
    displayCompany: resolvedCompany || "Company TBD",
    displayLocation: resolvedLocation || "Location TBD",
  };
}

function buildStrategistRecommendationsHeuristic(args: {
  telemetry: Awaited<ReturnType<typeof loadOutcomeTelemetry>>;
  leads: Array<{ recommendation: string; liveStatus: string; fitScore: number; remotePolicy: string }>;
}) {
  const recommendations = [];
  const prioritized = args.leads.filter((lead) => lead.recommendation === "prioritize").length;
  const stale = args.leads.filter((lead) => lead.liveStatus === "expired").length;
  const remoteWins = args.leads.filter((lead) => lead.remotePolicy.includes("remote") && lead.fitScore >= 70).length;

  recommendations.push({
    title: `${prioritized} leads are above your strategist floor`,
    body: prioritized
      ? "Use the control room to tailor only the leads the strategist has already cleared."
      : "Run orchestration on saved leads so the strategist can start ranking them.",
    tone: prioritized ? "positive" : "neutral",
  });

  recommendations.push({
    title: `${stale} listings need freshness checks`,
    body: stale
      ? "Expired or uncertain listings should not consume resume-generation time."
      : "Your saved pipeline is currently clear of stale-job warnings.",
    tone: stale ? "warning" : "positive",
  });

  recommendations.push({
    title: `${remoteWins} remote-friendly leads match your current strategy`,
    body:
      args.telemetry.evaluationCount > 0
        ? "The strategist is already folding historical outcomes back into new recommendations."
        : "As new outcomes arrive, this digest will start highlighting what is actually converting for you.",
    tone: "neutral",
  });

  return recommendations;
}

const digestSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        tone: z.enum(["positive", "warning", "neutral"]),
      }),
    )
    .min(1)
    .max(4),
});

// Motivation vs Logic:
// Motivation: Strategist notes should read like guidance, not fixed templates.
// Logic: Try a tiny JSON-only digest from the same pipeline stats; on failure, keep the legacy count-based copy.
async function buildStrategistRecommendations(args: {
  telemetry: Awaited<ReturnType<typeof loadOutcomeTelemetry>>;
  leads: Array<{ recommendation: string; liveStatus: string; fitScore: number; remotePolicy: string }>;
  v2EvaluationCount: number;
}) {
  const prioritized = args.leads.filter((lead) => lead.recommendation === "prioritize").length;
  const stale = args.leads.filter((lead) => lead.liveStatus === "expired").length;
  const consider = args.leads.filter((lead) => lead.recommendation === "consider").length;
  const skip = args.leads.filter((lead) => lead.recommendation === "skip").length;
  const remoteWins = args.leads.filter((lead) => lead.remotePolicy.includes("remote") && lead.fitScore >= 70).length;
  const summary = {
    leadCount: args.leads.length,
    prioritized,
    consider,
    skip,
    stale,
    remoteWins,
    telemetryEvals: args.telemetry.evaluationCount,
    v2ScoredEvaluations: args.v2EvaluationCount,
  };

  try {
    const prompt = `You are a concise career strategist. Given pipeline summary JSON, return ONLY valid JSON with key "items": an array of 2-3 objects with "title", "body" (2 sentences max), "tone" one of positive|warning|neutral. Focus on actionable next steps; mention AI-driven (v2) analysis when v2ScoredEvaluations is positive. Do not mention internal field names.
Summary: ${JSON.stringify(summary)}`;
    const raw = await generateJsonSafe("easy", prompt, 1);
    const normalized =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? {
            items: (raw as { items?: unknown; recommendations?: unknown }).items ?? (raw as { recommendations?: unknown[] }).recommendations ?? [],
          }
        : { items: [] };
    const parsed = digestSchema.parse(normalized);
    if (parsed.items.length) {
      return parsed.items.map((item) => ({ title: item.title, body: item.body, tone: item.tone }));
    }
  } catch {
    // fall through
  }
  return buildStrategistRecommendationsHeuristic(args);
}

export async function getControlRoomOverview(userId: string) {
  await connectToDatabase();

  const [context, telemetry, campaigns, leads, evaluations, artifacts] = await Promise.all([
    loadUserContextSnapshot(userId),
    loadOutcomeTelemetry(userId),
    SearchCampaignModel.find({ userId }).sort({ createdAt: -1 }).limit(6).lean(),
    JobLeadModel.find({ userId }).sort({ updatedAt: -1 }).limit(24).lean(),
    JobEvaluationModel.find({ userId }).sort({ createdAt: -1 }).limit(24).lean(),
    GeneratedArtifactModel.countDocuments({ userId }),
  ]);

  const pipelineCounts = Object.entries(
    leads.reduce<Record<string, number>>((counts, lead) => {
      counts[lead.lifecycleState] = (counts[lead.lifecycleState] || 0) + 1;
      return counts;
    }, {}),
  ).map(([state, count]) => ({ state, count }));

  // Root Cause: Legacy heuristic evaluations used raw page tokens as gap "titles", polluting the heatmap.
  // Logic: Only aggregate gaps from v2 strategists (LLM or LLM-fallback) using stable `gap.code` when present.
  function isV2Evaluation(e: { analysisVersion?: number; analysisSource?: string }): boolean {
    if (e.analysisSource === "llm" || e.analysisSource === "fallback") return true;
    return typeof e.analysisVersion === "number" && e.analysisVersion >= CONTROL_ROOM_ANALYSIS_VERSION;
  }

  const v2Evaluations = evaluations.filter(isV2Evaluation);

  type BlockerAggregate = {
    count: number;
    severity?: string;
    detail?: string;
    mitigation?: string;
    displayLabel: string;
    code?: string;
  };

  type GapLike = { title: string; severity?: string; detail?: string; mitigation?: string; code?: string; supportingRequirements?: string[] };

  const blockerHeatmap = v2Evaluations
    .flatMap((evaluation) => (evaluation.gapMap || []) as GapLike[])
    .reduce<Record<string, BlockerAggregate>>((counts, gap) => {
      const displayLabel = (gap.title || "Unknown").trim() || "Unknown";
      const key = (gap.code && String(gap.code).trim()) || slugify(gap.title);
      const existing = counts[key] || { count: 0, displayLabel, code: gap.code || undefined };
      existing.count += 1;
      if (!existing.severity && gap.severity) existing.severity = gap.severity;
      if (!existing.detail && gap.detail) existing.detail = gap.detail;
      if (!existing.mitigation && gap.mitigation) existing.mitigation = gap.mitigation;
      if (!existing.displayLabel) existing.displayLabel = displayLabel;
      if (!existing.code && gap.code) existing.code = gap.code;
      counts[key] = existing;
      return counts;
    }, {});

  const formattedLeads = await Promise.all(
    leads.map(async (lead) => ({
      ...serialize(lead),
      ...(await buildLeadDisplayInfo(lead, { allowAi: false })),
    })),
  );

  return {
    context,
    summary: {
      activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
      leadCount: leads.length,
      prioritizedCount: leads.filter((lead) => lead.recommendation === "prioritize").length,
      tailoredCount: leads.filter((lead) => lead.lifecycleState === "tailored" || lead.lifecycleState === "exported").length,
      artifactCount: artifacts,
    },
    pipelineCounts,
    campaigns: serialize(campaigns),
    leads: formattedLeads,
    blockerHeatmap: Object.entries(blockerHeatmap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([, aggregate]) => ({
        label: aggregate.displayLabel,
        code: aggregate.code,
        count: aggregate.count,
        severity: aggregate.severity,
        detail: aggregate.detail,
        mitigation: aggregate.mitigation,
      })),
    heatmapExcludesLegacyHeuristic: v2Evaluations.length < evaluations.length && evaluations.length > 0,
    recommendations: await buildStrategistRecommendations({
      telemetry,
      leads,
      v2EvaluationCount: v2Evaluations.length,
    }),
  };
}

export async function getLeadDetail(userId: string, leadId: string) {
  await connectToDatabase();

  const [lead, evaluation, tailoringRun, artifacts, events] = await Promise.all([
    JobLeadModel.findOne({ _id: leadId, userId }).lean(),
    JobEvaluationModel.findOne({ leadId, userId }).sort({ createdAt: -1 }).lean(),
    TailoringRunModel.findOne({ leadId, userId }).sort({ createdAt: -1 }).lean(),
    GeneratedArtifactModel.find({ leadId, userId }).sort({ createdAt: -1 }).lean(),
    ApplicationEventModel.find({ leadId, userId }).sort({ createdAt: -1 }).limit(12).lean(),
  ]);

  if (!lead) {
    throw new Error("Lead not found.");
  }

  const displayInfo = await buildLeadDisplayInfo(lead, { allowAi: true });

  return {
    lead: {
      ...serialize(lead),
      ...displayInfo,
    },
    evaluation: serialize(evaluation),
    tailoringRun: serialize(tailoringRun),
    artifacts: serialize(artifacts),
    events: serialize(events),
  };
}
