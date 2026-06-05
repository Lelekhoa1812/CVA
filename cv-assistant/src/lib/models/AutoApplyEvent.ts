import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplyEventSchema = new Schema(
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
      default: null,
      index: true,
    },
    applicationDraftId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplyApplicationDraft",
      default: null,
    },
    type: { type: String, required: true, index: true },
    message: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type AutoApplyEvent = InferSchemaType<typeof AutoApplyEventSchema>;

export const AutoApplyEventModel: Model<AutoApplyEvent> =
  mongoose.models.AutoApplyEvent ||
  mongoose.model<AutoApplyEvent>("AutoApplyEvent", AutoApplyEventSchema);
