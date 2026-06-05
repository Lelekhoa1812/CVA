import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplyApplicationDraftSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplySession",
      required: true,
      index: true,
    },
    jobCandidateId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplyJobCandidate",
      required: true,
      index: true,
    },
    resumeFileId: { type: Schema.Types.ObjectId, ref: "AutoApplyUploadedFile", default: null },
    coverLetterText: { type: String, default: "" },
    coverLetterFileId: { type: Schema.Types.ObjectId, ref: "AutoApplyUploadedFile", default: null },
    additionalDocumentFileIds: {
      type: [Schema.Types.ObjectId],
      ref: "AutoApplyUploadedFile",
      default: [],
    },
    employerQuestions: { type: [Schema.Types.Mixed], default: [] },
    answers: { type: [Schema.Types.Mixed], default: [] },
    userProvidedAnswers: { type: [Schema.Types.Mixed], default: [] },
    uncertaintyFlags: { type: [String], default: [] },
    generatedApplicationSummary: { type: String, default: "" },
    riskNotes: { type: [String], default: [] },
    finalReviewStatus: {
      type: String,
      enum: ["not_ready", "ready", "confirmed", "submitted", "blocked"],
      default: "not_ready",
      index: true,
    },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AutoApplyApplicationDraftSchema.index({ sessionId: 1, jobCandidateId: 1 }, { unique: true });

export type AutoApplyApplicationDraft = InferSchemaType<typeof AutoApplyApplicationDraftSchema>;

export const AutoApplyApplicationDraftModel: Model<AutoApplyApplicationDraft> =
  mongoose.models.AutoApplyApplicationDraft ||
  mongoose.model<AutoApplyApplicationDraft>(
    "AutoApplyApplicationDraft",
    AutoApplyApplicationDraftSchema,
  );
