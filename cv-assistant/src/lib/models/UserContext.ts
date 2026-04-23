import mongoose, { InferSchemaType, Model, Schema } from "mongoose";
import { CandidateFactSchema } from "@/lib/models/CandidateFact";
import { StoryBankItemSchema } from "@/lib/models/StoryBankItem";

const CultureSignalSchema = new Schema(
  {
    label: { type: String, default: "" },
    weight: { type: Number, default: 0.5 },
  },
  { _id: false },
);

const CompensationPreferencesSchema = new Schema(
  {
    currency: { type: String, default: "AUD" },
    targetMin: { type: Number, default: 0 },
    targetMax: { type: Number, default: 0 },
    salaryFloor: { type: Number, default: 0 },
  },
  { _id: false },
);

const WorkPreferencesSchema = new Schema(
  {
    modes: { type: [String], default: ["remote", "hybrid"] },
    preferredLocations: { type: [String], default: [] },
    avoidLocations: { type: [String], default: [] },
    visaStatus: { type: String, default: "" },
    remoteOnly: { type: Boolean, default: false },
  },
  { _id: false },
);

const SearchPreferencesSchema = new Schema(
  {
    jobTitles: { type: [String], default: [] },
    locations: { type: [String], default: [] },
    sources: { type: [String], default: [] },
    remoteOnly: { type: Boolean, default: false },
  },
  { _id: false },
);

const OutreachPreferencesSchema = new Schema(
  {
    channels: { type: [String], default: ["email", "linkedin"] },
    tone: { type: String, default: "confident" },
  },
  { _id: false },
);

const CalibrationSchema = new Schema(
  {
    lastFeedbackAt: { type: Date, default: null },
    selfFilteredReasons: { type: [String], default: [] },
    winningPatterns: { type: [String], default: [] },
  },
  { _id: false },
);

const UserContextSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    targetRoles: { type: [String], default: [] },
    archetypes: { type: [String], default: [] },
    compensation: { type: CompensationPreferencesSchema, default: () => ({}) },
    workPreferences: { type: WorkPreferencesSchema, default: () => ({}) },
    searchPreferences: { type: SearchPreferencesSchema, default: () => ({}) },
    techStackPreferences: { type: [String], default: [] },
    cultureSignals: { type: [CultureSignalSchema], default: [] },
    proofPoints: { type: [String], default: [] },
    learnedExclusions: { type: [String], default: [] },
    scoreFloor: { type: Number, default: 65 },
    outreachPreferences: { type: OutreachPreferencesSchema, default: () => ({}) },
    candidateFacts: { type: [CandidateFactSchema], default: [] },
    storyBank: { type: [StoryBankItemSchema], default: [] },
    calibration: { type: CalibrationSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type UserContext = InferSchemaType<typeof UserContextSchema>;

export const UserContextModel: Model<UserContext> =
  mongoose.models.UserContext || mongoose.model<UserContext>("UserContext", UserContextSchema);
