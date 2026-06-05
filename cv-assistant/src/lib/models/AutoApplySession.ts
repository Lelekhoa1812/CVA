import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplySessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mode: {
      type: String,
      enum: ["ai_coaching", "manual_curate"],
      default: "ai_coaching",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "idle",
        "searching",
        "ranking",
        "awaiting_selection",
        "preparing",
        "browser_active",
        "awaiting_user_answer",
        "ready_for_review",
        "submitting",
        "submitted",
        "blocked",
        "failed",
        "stopped",
        "completed",
      ],
      default: "idle",
      index: true,
    },
    prompt: { type: String, default: "" },
    filters: { type: Schema.Types.Mixed, default: {} },
    uploadedResumeId: { type: Schema.Types.ObjectId, ref: "AutoApplyUploadedFile", default: null },
    uploadedAdditionalDocumentIds: {
      type: [Schema.Types.ObjectId],
      ref: "AutoApplyUploadedFile",
      default: [],
    },
    selectedGroundTruthIds: { type: [String], default: [] },
    sessionGroundTruthSnapshot: { type: Schema.Types.Mixed, default: {} },
    allowFullResumeContext: { type: Boolean, default: false },
    currentJobCandidateId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplyJobCandidate",
      default: null,
    },
    lastError: { type: String, default: "" },
    stoppedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type AutoApplySession = InferSchemaType<typeof AutoApplySessionSchema>;

export const AutoApplySessionModel: Model<AutoApplySession> =
  mongoose.models.AutoApplySession ||
  mongoose.model<AutoApplySession>("AutoApplySession", AutoApplySessionSchema);
