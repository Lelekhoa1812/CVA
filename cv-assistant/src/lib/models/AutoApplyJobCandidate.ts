import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplyJobCandidateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplySession",
      required: true,
      index: true,
    },
    source: { type: String, default: "", index: true },
    sourceJobId: { type: String, default: "" },
    dedupeKey: { type: String, required: true },
    title: { type: String, default: "" },
    company: { type: String, default: "" },
    location: { type: String, default: "" },
    workMode: { type: String, default: "" },
    salary: { type: String, default: "" },
    url: { type: String, default: "" },
    applyUrl: { type: String, default: "" },
    applyUrlType: { type: String, default: "listing" },
    descriptionText: { type: String, default: "" },
    requirements: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    fitScore: { type: Number, default: 0 },
    fitReasons: { type: [String], default: [] },
    missingRequirements: { type: [String], default: [] },
    riskFlags: { type: [String], default: [] },
    applicationStrategy: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "discovered",
        "shortlisted",
        "selected",
        "preparing",
        "needs_input",
        "prepared",
        "approved",
        "applied",
        "skipped",
        "failed",
        // legacy values written by the previous engine
        "ready_for_review",
        "submitted",
        "manual_apply_recommended",
      ],
      default: "discovered",
      index: true,
    },
    snippet: { type: String, default: "" },
    postedAt: { type: String, default: "" },
    discoveredVia: { type: String, default: "job_board" },
    recommendation: { type: String, default: "" },
    fitVerdict: { type: String, default: "" },
    scoredBy: { type: String, default: "heuristic" },
    ats: {
      provider: { type: String, default: "" },
      board: { type: String, default: "" },
      jobId: { type: String, default: "" },
      matchedBy: { type: String, default: "" },
      confidence: { type: Number, default: 0 },
    },
    formSource: { type: String, default: "" },
    questions: { type: [Schema.Types.Mixed], default: [] },
    heuristicScore: { type: Number, default: 0 },
    fitGaps: { type: [String], default: [] },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: [String], default: [] },
    stageHistory: {
      type: [{ stage: String, at: Date, note: String, _id: false }],
      default: [],
    },
    preparingStartedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    attempts: { type: Number, default: 0 },
    // What the local apply agent last did with this application. Absent until it has run.
    agent: {
      type: new Schema(
        {
          status: { type: String, default: "" },
          mode: { type: String, default: "" },
          reason: { type: String, default: "" },
          filled: { type: Number, default: 0 },
          total: { type: Number, default: 0 },
          missing: { type: [String], default: [] },
          confirmation: { type: String, default: "" },
          screenshot: { type: String, default: "" },
          at: { type: Date, default: null },
          running: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

AutoApplyJobCandidateSchema.index({ sessionId: 1, dedupeKey: 1 }, { unique: true });

export type AutoApplyJobCandidate = InferSchemaType<typeof AutoApplyJobCandidateSchema>;

export const AutoApplyJobCandidateModel: Model<AutoApplyJobCandidate> =
  mongoose.models.AutoApplyJobCandidate ||
  mongoose.model<AutoApplyJobCandidate>("AutoApplyJobCandidate", AutoApplyJobCandidateSchema);
