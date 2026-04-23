import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const SearchCampaignQuerySchema = new Schema(
  {
    jobTitle: { type: String, required: true },
    location: { type: String, required: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    maxResultsPerSource: { type: Number, default: 50 },
    selectedSources: { type: [String], default: [] },
  },
  { _id: false },
);

const SearchCampaignSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["active", "completed", "failed", "canceled"],
      default: "active",
      index: true,
    },
    query: { type: SearchCampaignQuerySchema, required: true },
    totalResults: { type: Number, default: 0 },
    blockedSources: { type: [String], default: [] },
    errorMessage: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type SearchCampaign = InferSchemaType<typeof SearchCampaignSchema>;

export const SearchCampaignModel: Model<SearchCampaign> =
  mongoose.models.SearchCampaign ||
  mongoose.model<SearchCampaign>("SearchCampaign", SearchCampaignSchema);
