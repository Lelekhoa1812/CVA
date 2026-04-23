import { connectToDatabase } from "@/lib/db";
import { loadUserContextSnapshot } from "@/lib/career/context";
import { loadOutcomeTelemetry } from "@/lib/career/telemetry";
import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { GeneratedArtifactModel } from "@/lib/models/GeneratedArtifact";
import { JobEvaluationModel } from "@/lib/models/JobEvaluation";
import { JobLeadModel } from "@/lib/models/JobLead";
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

function buildStrategistRecommendations(args: {
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

  type BlockerAggregate = {
    count: number;
    severity?: string;
    detail?: string;
    mitigation?: string;
  };

  const blockerHeatmap = evaluations
    .flatMap((evaluation) => evaluation.gapMap || [])
    .reduce<Record<string, BlockerAggregate>>((counts, gap) => {
      const existing = counts[gap.title] || { count: 0 };
      existing.count += 1;
      if (!existing.severity && gap.severity) existing.severity = gap.severity;
      if (!existing.detail && gap.detail) existing.detail = gap.detail;
      if (!existing.mitigation && gap.mitigation) existing.mitigation = gap.mitigation;
      counts[gap.title] = existing;
      return counts;
    }, {});

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
    leads: serialize(leads),
    blockerHeatmap: Object.entries(blockerHeatmap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([label, aggregate]) => ({
        label,
        count: aggregate.count,
        severity: aggregate.severity,
        detail: aggregate.detail,
        mitigation: aggregate.mitigation,
      })),
    recommendations: buildStrategistRecommendations({ telemetry, leads }),
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

  return {
    lead: serialize(lead),
    evaluation: serialize(evaluation),
    tailoringRun: serialize(tailoringRun),
    artifacts: serialize(artifacts),
    events: serialize(events),
  };
}
