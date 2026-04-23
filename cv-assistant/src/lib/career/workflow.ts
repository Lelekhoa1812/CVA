import { connectToDatabase } from "@/lib/db";
import { scoreLeadFit } from "@/lib/career/career-strategist";
import { getLeadDetail } from "@/lib/career/control-room";
import { loadUserContextSnapshot } from "@/lib/career/context";
import { enrichLead } from "@/lib/career/market-analyst";
import { createTailoringArtifacts } from "@/lib/career/resume-specialist";
import { loadOutcomeTelemetry } from "@/lib/career/telemetry";
import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { GeneratedArtifactModel } from "@/lib/models/GeneratedArtifact";
import { JobEvaluationModel } from "@/lib/models/JobEvaluation";
import { JobLeadModel } from "@/lib/models/JobLead";
import { TailoringRunModel } from "@/lib/models/TailoringRun";
import { UserModel } from "@/lib/models/User";

type StoredProfile = {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  skills?: string;
  languages?: string;
  profileSummary?: string;
  projects?: Array<{ name?: string; summary?: string; description?: string }>;
  experiences?: Array<{
    companyName?: string;
    role?: string;
    summary?: string;
    description?: string;
    timeFrom?: string;
    timeTo?: string;
  }>;
};

/* Motivation vs Logic:
   Motivation: The roadmap calls for specialized agents that share memory and leave durable state behind, so the
   orchestration path needs to persist every stage transition rather than treating job analysis like one transient API call.
   Logic: Run the Market Analyst, Career Strategist, and Resume Specialist in sequence, store their outputs in the new
   domain models, and emit application events for each hand-off so the control room can reconstruct what happened later. */
export async function orchestrateLead(userId: string, leadId: string) {
  await connectToDatabase();

  const [context, telemetry, user] = await Promise.all([
    loadUserContextSnapshot(userId),
    loadOutcomeTelemetry(userId),
    UserModel.findById(userId).lean(),
  ]);
  const profile = ((user?.profile || {}) as StoredProfile) || {};

  const { lead } = await enrichLead(userId, leadId);
  const evaluationResult = scoreLeadFit(lead, context, telemetry);

  const evaluation = await JobEvaluationModel.create({
    userId,
    leadId: lead._id,
    ...evaluationResult,
  });

  lead.fitScore = evaluationResult.fitScore;
  lead.recommendation = evaluationResult.recommendation;
  lead.lifecycleState = "scored";
  lead.lastWorkflowAt = new Date();
  await lead.save();

  await ApplicationEventModel.create({
    userId,
    leadId: lead._id,
    evaluationId: evaluation._id,
    type: "scored",
    payload: {
      fitScore: evaluationResult.fitScore,
      recommendation: evaluationResult.recommendation,
    },
  });

  if (evaluationResult.recommendation === "skip") {
    await ApplicationEventModel.create({
      userId,
      leadId: lead._id,
      evaluationId: evaluation._id,
      type: "self_filtered",
      payload: {
        reasons: evaluationResult.gapMap.map((gap) => gap.title),
      },
    });

    return getLeadDetail(userId, leadId);
  }

  const tailoring = await createTailoringArtifacts({
    profile,
    lead,
    context,
    evaluation: evaluationResult,
  });

  const tailoringRun = await TailoringRunModel.create({
    userId,
    leadId: lead._id,
    evaluationId: evaluation._id,
    status: tailoring.atsValidation.passed ? "exported" : "validated",
    evidenceSet: tailoring.evidenceSet,
    resumeDraft: tailoring.resumeDraft,
    atsValidation: tailoring.atsValidation,
  });

  const artifacts = await GeneratedArtifactModel.insertMany(
    tailoring.artifacts.map((artifact) => ({
      userId,
      leadId: lead._id,
      tailoringRunId: tailoringRun._id,
      ...artifact,
    })),
  );

  tailoringRun.artifactIds = artifacts.map((artifact) => artifact._id);
  await tailoringRun.save();

  await lead.updateOne({
    $set: {
      lifecycleState: "exported",
      lastWorkflowAt: new Date(),
    },
  });

  await ApplicationEventModel.create([
    {
      userId,
      leadId: lead._id,
      evaluationId: evaluation._id,
      type: "tailored",
      payload: {
        evidenceCount: tailoring.evidenceSet.length,
        keywordCoverage: tailoring.atsValidation.keywordCoverage,
      },
    },
    {
      userId,
      leadId: lead._id,
      evaluationId: evaluation._id,
      type: "exported",
      payload: {
        artifactCount: artifacts.length,
        variants: artifacts.map((artifact) => artifact.variant),
      },
    },
  ]);

  await JobLeadModel.findByIdAndUpdate(lead._id, { $set: { lifecycleState: "exported" } });
  return getLeadDetail(userId, leadId);
}
