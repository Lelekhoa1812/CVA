import { InferSchemaType, Schema } from "mongoose";

export const CandidateFactSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["profile", "experience", "project", "skill", "story"],
      default: "profile",
    },
    title: { type: String, default: "" },
    sourceLabel: { type: String, default: "" },
    summary: { type: String, default: "" },
    evidence: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    impact: { type: String, default: "" },
    confidence: { type: Number, default: 0.7 },
    sourceHash: { type: String, default: "" },
  },
  { _id: false },
);

export type CandidateFact = InferSchemaType<typeof CandidateFactSchema>;
