import { InferSchemaType, Schema } from "mongoose";

export const StoryBankItemSchema = new Schema(
  {
    title: { type: String, default: "" },
    situation: { type: String, default: "" },
    task: { type: String, default: "" },
    action: { type: String, default: "" },
    result: { type: String, default: "" },
    reflection: { type: String, default: "" },
    tags: { type: [String], default: [] },
    evidenceSource: { type: String, default: "" },
    confidence: { type: Number, default: 0.6 },
  },
  { _id: false },
);

export type StoryBankItem = InferSchemaType<typeof StoryBankItemSchema>;
