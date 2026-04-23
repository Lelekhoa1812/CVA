import { z } from "zod";
import { generateJsonSafe } from "@/lib/ai";
import type { JobEvaluationResult, StrategistGap, UserContextSnapshot } from "./types";
import { CONTROL_ROOM_ANALYSIS_VERSION } from "./types";
import { buildRequirementMatches, type LeadLike, type TelemetryLike } from "./career-strategist-helpers";
import { clamp, overlapScore, parseSalaryRange, tokenize, uniqueStrings } from "./utils";

export { buildRequirementMatches, type LeadLike, type TelemetryLike } from "./career-strategist-helpers";

/* Motivation vs Logic:
   Motivation: Users need reasoning-based fit, gaps, and requirements — not page-scrape tokens as "requirements".
   Logic: Primary path is a schema-validated LLM evaluation grounded in user context and structured job understanding;
   deterministic heuristics are used only as fallback when the model is unavailable, plus hard guardrails for liveness and remote. */

const dimensionScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number(),
  reason: z.string(),
});

const gapSchema = z.object({
  code: z.string().optional(),
  title: z.string(),
  severity: z.enum(["critical", "moderate", "minor"]),
  detail: z.string(),
  mitigation: z.string(),
  supportingRequirements: z.array(z.string()).optional(),
});

const reqMatchSchema = z.object({
  requirement: z.string(),
  coverage: z.enum(["covered", "partial", "gap"]),
  matchedFacts: z.array(z.string()).default([]),
});

const strategLlmSchema = z.object({
  fitScore: z.number(),
  recommendation: z.enum(["prioritize", "consider", "skip"]),
  dimensionScores: z.array(dimensionScoreSchema).min(4),
  gapMap: z.array(gapSchema).max(8),
  matchedRequirements: z.array(reqMatchSchema).max(20),
  reasoningSummary: z.string(),
  nextActions: z.array(z.string()).max(6),
});

function modelIdLabel() {
  return (typeof process !== "undefined" && process.env.AZURE_AI_FOUNDRY_MODEL) || "gpt-5.4-mini";
}

function contextJson(context: UserContextSnapshot): string {
  return JSON.stringify(
    {
      targetRoles: context.targetRoles,
      scoreFloor: context.scoreFloor,
      compensation: context.compensation,
      workPreferences: context.workPreferences,
      searchPreferences: context.searchPreferences,
      techStackPreferences: context.techStackPreferences,
      cultureSignals: context.cultureSignals,
      candidateFacts: context.candidateFacts.map((f) => ({
        title: f.title,
        kind: f.kind,
        keywords: f.keywords,
        summary: f.summary?.slice(0, 400),
        evidence: f.evidence?.slice(0, 2),
      })),
      storyBank: context.storyBank.map((s) => ({
        title: s.title,
        tags: s.tags,
        action: s.action?.slice(0, 200),
        result: s.result?.slice(0, 200),
      })),
    },
    null,
    0,
  );
}

function requirementSeeds(lead: LeadLike): string[] {
  const ju = lead.jobUnderstanding;
  if (ju?.mustHaveRequirements?.length) {
    return uniqueStrings([...ju.mustHaveRequirements, ...lead.extractedKeywords]).slice(0, 12);
  }
  return lead.extractedKeywords.slice(0, 8);
}

function ensureGapCodes(gaps: StrategistGap[]): StrategistGap[] {
  return gaps.map((g, i) => ({
    ...g,
    code: g.code?.trim() || `gap_theme_${i}_${g.title.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`.slice(0, 64),
  }));
}

function applyHardGuardrails(lead: LeadLike, context: UserContextSnapshot, result: JobEvaluationResult): JobEvaluationResult {
  const remoteOnly = context.workPreferences.remoteOnly;
  const byCode = new Set(result.gapMap.map((g) => g.code).filter(Boolean));
  const gapMap = ensureGapCodes([...result.gapMap]);

  if (lead.liveStatus === "expired" && !byCode.has("listing_freshness")) {
    gapMap.unshift({
      code: "listing_freshness",
      title: "Listing freshness",
      severity: "critical",
      detail: "The Market Analyst flagged this posting as expired.",
      mitigation: "Do not tailor or apply until the live status is manually verified.",
    });
  }
  if (remoteOnly && !lead.remotePolicy.includes("remote") && !byCode.has("work_mode_mismatch")) {
    gapMap.unshift({
      code: "work_mode_mismatch",
      title: "Work-mode mismatch",
      severity: "critical",
      detail: "Your context is set to remote-first while the listing is not remote-friendly.",
      mitigation: "Either relax the remote constraint or deprioritize this lead.",
    });
  }

  const hasCritical = gapMap.some((g) => g.severity === "critical");
  const recommendation =
    hasCritical || result.fitScore < context.scoreFloor ? "skip" : result.recommendation;

  return {
    ...result,
    gapMap,
    recommendation,
  };
}

async function runStrategistLlm(
  lead: LeadLike,
  context: UserContextSnapshot,
  telemetry: TelemetryLike,
): Promise<JobEvaluationResult> {
  const jobPart = lead.jobUnderstanding
    ? JSON.stringify(lead.jobUnderstanding, null, 0)
    : `{"note":"no structured job understanding; infer only from description"}`;

  const prompt = `You are the "Career Strategist" for a job application assistant. You must ground every claim in the provided user context and job data. Do not invent experience the candidate does not have. Use the structured job understanding when present; otherwise parse the job description.

Return ONLY valid JSON with these keys:
"fitScore" (0-100)
"recommendation": "prioritize" | "consider" | "skip"
"dimensionScores": array of { "key", "label", "score" (0-100), "reason" } for at least: role_alignment, evidence_coverage, compensation, work_mode, culture, liveness, historical (use labels suitable for a dashboard).
"gapMap": array of up to 6 blockers, each { "code" (snake_case id), "title" (short human label), "severity", "detail", "mitigation", "supportingRequirements" optional string array }.
"matchedRequirements": array of { "requirement", "coverage" ("covered"|"partial"|"gap"), "matchedFacts" (array of which candidate fact titles or story titles support it, or empty) }.
"reasoningSummary": one paragraph
"nextActions": string array, max 4 items

Rules:
- "prioritize" only if fit is strong vs score floor (${context.scoreFloor}) and there is no unsolvable blocker.
- "skip" if evidence is too thin for must-have requirements, compensation is a clear mismatch, or liveness is fatally bad.
- Every gap must be explainable; never use a single random keyword as a title. Use business-readable themes.
- Gaps for missing skills must name the missing capability, not a scraper token.

User context (JSON):
${contextJson(context)}

Telemetry hint:
${JSON.stringify({
    evaluationCount: telemetry.evaluationCount,
    skippedCount: telemetry.skippedCount,
    prioritizedCount: telemetry.prioritizedCount,
  })}

Lead (JSON):
${JSON.stringify(
  {
    company: lead.company,
    title: lead.title,
    location: lead.location,
    salaryText: lead.salaryText,
    remotePolicy: lead.remotePolicy,
    liveStatus: lead.liveStatus,
    companySignals: lead.companySignals,
  },
  null,
  0,
)}

Structured job understanding (may be from LLM extraction):
${jobPart}

Job description excerpt:
${JSON.stringify((lead.canonicalJobDescription || "").replace(/\s+/g, " ").trim().slice(0, 8000))}
`;

  const raw = await generateJsonSafe("hard", prompt, 2);
  const parsed = strategLlmSchema.parse(raw);
  const fitScore = Math.round(clamp(parsed.fitScore, 0, 100));

  const out: JobEvaluationResult = {
    fitScore,
    recommendation: parsed.recommendation,
    dimensionScores: parsed.dimensionScores.map((d) => ({
      ...d,
      score: Math.round(clamp(d.score, 0, 100)),
    })),
    gapMap: parsed.gapMap.map((g) => ({
      code: g.code,
      title: g.title,
      severity: g.severity,
      detail: g.detail,
      mitigation: g.mitigation,
      supportingRequirements: g.supportingRequirements,
    })),
    matchedRequirements: parsed.matchedRequirements,
    reasoningSummary: parsed.reasoningSummary,
    nextActions: parsed.nextActions,
    telemetrySnapshot: {
      evaluationCount: telemetry.evaluationCount,
      prioritizedCount: telemetry.prioritizedCount,
      skippedCount: telemetry.skippedCount,
      exclusions: telemetry.commonExclusions,
    },
    analysisSource: "llm",
    analysisVersion: CONTROL_ROOM_ANALYSIS_VERSION,
    model: modelIdLabel(),
    jobUnderstanding: lead.jobUnderstanding || null,
  };
  return applyHardGuardrails(lead, context, out);
}

/**
 * Heuristic / offline fallback. Same logic as the legacy v1 strategist, but emits stable gap codes and v2 provenance.
 */
export function scoreLeadFitHeuristic(
  lead: LeadLike,
  context: UserContextSnapshot,
  telemetry: TelemetryLike,
  options: { analysisSource: "heuristic" | "fallback" },
): JobEvaluationResult {
  const seeds = requirementSeeds(lead);
  const roleTokens = tokenize(lead.title);
  const roleTargets = context.targetRoles.flatMap((role) => tokenize(role));
  const candidateKeywords = uniqueStrings([
    ...context.techStackPreferences,
    ...context.candidateFacts.flatMap((fact) => fact.keywords),
    ...context.targetRoles,
    ...context.storyBank.flatMap((story) => story.tags),
  ]).map((value) => value.toLowerCase());
  const leadKeywords = lead.extractedKeywords.map((k) => k.toLowerCase());
  const matchedRequirements = buildRequirementMatches(seeds, context);
  const criticalGaps = matchedRequirements.filter((m) => m.coverage === "gap").slice(0, 4);

  const roleAlignment = clamp(Math.round(overlapScore(roleTokens, roleTargets) * 100) || 32, 20, 100);
  const skillCoverage = clamp(
    Math.round(
      overlapScore(leadKeywords, candidateKeywords) * 100 +
        matchedRequirements.filter((m) => m.coverage === "covered").length * 4,
    ),
    18,
    100,
  );
  const salary = parseSalaryRange(lead.salaryText);
  const salaryFloor = context.compensation.salaryFloor || context.compensation.targetMin || 0;
  const compensationFit =
    salaryFloor === 0 || salary.maximum === 0
      ? 58
      : salary.maximum >= salaryFloor
        ? 82
        : salary.minimum >= salaryFloor
          ? 68
          : 34;
  const remotePreference = context.workPreferences.remoteOnly;
  const workModeFit =
    remotePreference && lead.remotePolicy !== "remote" && lead.remotePolicy !== "global remote"
      ? 22
      : context.workPreferences.modes.includes("remote") && lead.remotePolicy.includes("remote")
        ? 85
        : lead.remotePolicy === "hybrid"
          ? 63
          : 55;
  const cultureKeywords = context.cultureSignals.map((s) => s.label.toLowerCase());
  const cultureFit = clamp(
    Math.round(overlapScore(cultureKeywords, lead.companySignals.map((s) => s.toLowerCase())) * 100) || 55,
    35,
    95,
  );
  const historicalFit =
    telemetry.evaluationCount === 0
      ? 60
      : clamp(
          45 +
            telemetry.prioritizedCount * 6 -
            telemetry.skippedCount * 2 +
            matchedRequirements.filter((m) => m.coverage === "covered").length * 3,
          20,
          95,
        );
  const liveSignal = lead.liveStatus === "active" ? 88 : lead.liveStatus === "uncertain" ? 52 : 10;
  const dimensionScores = [
    { key: "role_alignment", label: "Role alignment", score: roleAlignment, reason: "Heuristic: title vs target role tokens." },
    { key: "skill_coverage", label: "Evidence coverage", score: skillCoverage, reason: "Heuristic: overlap with your saved facts and keywords." },
    { key: "compensation", label: "Compensation fit", score: compensationFit, reason: "Heuristic: range vs your floor." },
    { key: "work_mode", label: "Work-mode fit", score: workModeFit, reason: "Heuristic: remote policy vs preferences." },
    { key: "culture", label: "Culture signal fit", score: cultureFit, reason: "Heuristic: company signal overlap." },
    { key: "liveness", label: "Posting quality", score: liveSignal, reason: "Heuristic: listing liveness state." },
    { key: "historical", label: "Historical calibration", score: historicalFit, reason: "Heuristic: your recent outcomes." },
  ];
  const fitScore = Math.round(dimensionScores.reduce((s, d) => s + d.score, 0) / dimensionScores.length);

  const slug = (r: string) => r.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "req";
  const gapMap: StrategistGap[] = criticalGaps.map((g) => ({
    code: `missing_evidence_${slug(g.requirement)}`.slice(0, 64),
    title: g.requirement,
    severity: "moderate" as const,
    detail: `The current context has no direct evidence for: "${g.requirement}".`,
    mitigation: "Add a story-bank or fact that demonstrates this before applying.",
    supportingRequirements: [g.requirement],
  }));
  if (lead.liveStatus === "expired") {
    gapMap.unshift({
      code: "listing_freshness",
      title: "Listing freshness",
      severity: "critical",
      detail: "The Market Analyst flagged this posting as expired.",
      mitigation: "Do not tailor or apply until the live status is manually verified.",
    });
  }
  if (remotePreference && !lead.remotePolicy.includes("remote")) {
    gapMap.unshift({
      code: "work_mode_mismatch",
      title: "Work-mode mismatch",
      severity: "critical",
      detail: "Your context is set to remote-first while the listing is not remote-friendly.",
      mitigation: "Either relax the remote constraint or deprioritize this lead.",
    });
  }
  const recommendation =
    fitScore < context.scoreFloor || gapMap.some((g) => g.severity === "critical")
      ? "skip"
      : fitScore >= Math.max(context.scoreFloor, 78)
        ? "prioritize"
        : "consider";
  const nextActions =
    recommendation === "skip"
      ? ["Do not generate artifacts automatically.", "Capture why this lead was filtered."]
      : ["Run the Resume Specialist to tailor and validate coverage.", "Review the requirement map before export."];
  const winningPatterns = telemetry.winningKeywords.slice(0, 3);
  const reasoningSummary = [
    `${lead.company} — ${lead.title} scored ${fitScore}/100 (${options.analysisSource}).`,
    recommendation === "skip" ? "Falls below floor or a hard guardrail tripped." : "Compared against your score floor and saved context.",
    winningPatterns.length ? `Recent winning patterns: ${winningPatterns.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const base: JobEvaluationResult = {
    fitScore,
    recommendation,
    dimensionScores,
    gapMap,
    matchedRequirements,
    reasoningSummary,
    nextActions,
    telemetrySnapshot: {
      evaluationCount: telemetry.evaluationCount,
      prioritizedCount: telemetry.prioritizedCount,
      skippedCount: telemetry.skippedCount,
      exclusions: telemetry.commonExclusions,
    },
    analysisSource: options.analysisSource,
    analysisVersion: options.analysisSource === "fallback" ? CONTROL_ROOM_ANALYSIS_VERSION : 0,
    model: "heuristic",
    jobUnderstanding: lead.jobUnderstanding || null,
  };
  return options.analysisSource === "fallback" ? applyHardGuardrails(lead, context, base) : base;
}

/**
 * v2 strategist: LLM-first with heuristic fallback and deterministic guardrails.
 * Set `CONTROL_ROOM_STRATEGIST_MODE=heuristic` to force the legacy overlap path (e.g. unit tests without Azure keys).
 */
export async function scoreLeadFit(
  lead: LeadLike,
  context: UserContextSnapshot,
  telemetry: TelemetryLike,
): Promise<JobEvaluationResult> {
  if (process.env.CONTROL_ROOM_STRATEGIST_MODE === "heuristic") {
    return scoreLeadFitHeuristic(lead, context, telemetry, { analysisSource: "heuristic" });
  }
  try {
    if (!(lead.canonicalJobDescription || "").trim() || lead.canonicalJobDescription.length < 40) {
      throw new Error("Insufficient job description for LLM strategist");
    }
    return await runStrategistLlm(lead, context, telemetry);
  } catch {
    return scoreLeadFitHeuristic(lead, context, telemetry, { analysisSource: "fallback" });
  }
}
