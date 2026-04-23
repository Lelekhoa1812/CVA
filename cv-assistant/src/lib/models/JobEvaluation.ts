import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const DimensionScoreSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    score: { type: Number, required: true },
    reason: { type: String, default: "" },
  },
  { _id: false },
);

const GapSchema = new Schema(
  {
    code: { type: String, default: "" },
    title: { type: String, required: true },
    severity: { type: String, enum: ["critical", "moderate", "minor"], default: "minor" },
    detail: { type: String, default: "" },
    mitigation: { type: String, default: "" },
    supportingRequirements: { type: [String], default: [] },
  },
  { _id: false },
);

const RequirementCoverageSchema = new Schema(
  {
    requirement: { type: String, required: true },
    coverage: { type: String, enum: ["covered", "partial", "gap"], default: "gap" },
    matchedFacts: { type: [String], default: [] },
  },
  { _id: false },
);

const JobEvaluationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "JobLead", required: true, index: true },
    fitScore: { type: Number, default: 0 },
    recommendation: {
      type: String,
      enum: ["prioritize", "consider", "skip"],
      default: "consider",
    },
    dimensionScores: { type: [DimensionScoreSchema], default: [] },
    gapMap: { type: [GapSchema], default: [] },
    reasoningSummary: { type: String, default: "" },
    nextActions: { type: [String], default: [] },
    matchedRequirements: { type: [RequirementCoverageSchema], default: [] },
    telemetrySnapshot: { type: Schema.Types.Mixed, default: {} },
    // LLM-first strategist provenance (v2). Omitted on legacy documents.
    analysisSource: {
      type: String,
      enum: ["heuristic", "llm", "fallback"],
      default: "heuristic",
    },
    analysisVersion: { type: Number, default: 0 },
    model: { type: String, default: "" },
    jobUnderstanding: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export type JobEvaluation = InferSchemaType<typeof JobEvaluationSchema>;

export const JobEvaluationModel: Model<JobEvaluation> =
  mongoose.models.JobEvaluation ||
  mongoose.model<JobEvaluation>("JobEvaluation", JobEvaluationSchema);
