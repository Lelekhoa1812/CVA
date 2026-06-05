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
        "skipped",
        "preparing",
        "ready_for_review",
        "submitted",
        "failed",
        "manual_apply_recommended",
      ],
      default: "discovered",
      index: true,
    },
  },
  { timestamps: true },
);

AutoApplyJobCandidateSchema.index({ sessionId: 1, dedupeKey: 1 }, { unique: true });

export type AutoApplyJobCandidate = InferSchemaType<typeof AutoApplyJobCandidateSchema>;

export const AutoApplyJobCandidateModel: Model<AutoApplyJobCandidate> =
  mongoose.models.AutoApplyJobCandidate ||
  mongoose.model<AutoApplyJobCandidate>("AutoApplyJobCandidate", AutoApplyJobCandidateSchema);
