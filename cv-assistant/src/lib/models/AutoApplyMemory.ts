import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplyMemorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "AutoApplySession", default: null, index: true },
    scope: { type: String, enum: ["session", "reusable_profile"], default: "session", index: true },
    questionPattern: { type: String, required: true },
    answer: { type: String, required: true },
    source: {
      type: String,
      enum: ["user", "resume", "selected_project", "generated_with_user_approval"],
      default: "user",
    },
    provenance: { type: [String], default: [] },
    confidence: { type: Number, default: 0.8 },
    consentedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AutoApplyMemorySchema.index({ userId: 1, scope: 1, questionPattern: 1 });

export type AutoApplyMemory = InferSchemaType<typeof AutoApplyMemorySchema>;

export const AutoApplyMemoryModel: Model<AutoApplyMemory> =
  mongoose.models.AutoApplyMemory ||
  mongoose.model<AutoApplyMemory>("AutoApplyMemory", AutoApplyMemorySchema);
