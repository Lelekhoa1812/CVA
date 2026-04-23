import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const EvidenceItemSchema = new Schema(
  {
    type: { type: String, enum: ["project", "experience"], required: true },
    index: { type: Number, required: true },
    title: { type: String, required: true },
    score: { type: Number, default: 0 },
    matchedKeywords: { type: [String], default: [] },
    rewrittenContent: { type: String, default: "" },
  },
  { _id: false },
);

const TailoringRunSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "JobLead", required: true, index: true },
    evaluationId: { type: Schema.Types.ObjectId, ref: "JobEvaluation", required: true, index: true },
    status: {
      type: String,
      enum: ["planned", "generated", "validated", "exported"],
      default: "planned",
      index: true,
    },
    evidenceSet: { type: [EvidenceItemSchema], default: [] },
    resumeDraft: { type: Schema.Types.Mixed, default: {} },
    atsValidation: { type: Schema.Types.Mixed, default: {} },
    artifactIds: { type: [Schema.Types.ObjectId], ref: "GeneratedArtifact", default: [] },
  },
  { timestamps: true },
);

export type TailoringRun = InferSchemaType<typeof TailoringRunSchema>;

export const TailoringRunModel: Model<TailoringRun> =
  mongoose.models.TailoringRun ||
  mongoose.model<TailoringRun>("TailoringRun", TailoringRunSchema);
