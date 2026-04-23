import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const JobLeadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignIds: { type: [Schema.Types.ObjectId], ref: "SearchCampaign", default: [] },
    source: { type: String, default: "", index: true },
    dedupeKey: { type: String, required: true },
    title: { type: String, default: "" },
    company: { type: String, default: "" },
    location: { type: String, default: "" },
    postedText: { type: String, default: "" },
    snippet: { type: String, default: "" },
    listingUrl: { type: String, default: "" },
    applicationUrl: { type: String, default: "" },
    applicationUrlType: { type: String, default: "listing" },
    searchQueryMatch: { type: String, default: "partial" },
    lifecycleState: {
      type: String,
      enum: ["lead_found", "enriched", "scored", "tailored", "exported", "tracked", "followup_due"],
      default: "lead_found",
      index: true,
    },
    liveStatus: {
      type: String,
      enum: ["unknown", "active", "expired", "uncertain"],
      default: "unknown",
    },
    canonicalJobDescription: { type: String, default: "" },
    extractedKeywords: { type: [String], default: [] },
    salaryText: { type: String, default: "" },
    remotePolicy: { type: String, default: "" },
    employmentType: { type: String, default: "" },
    companySignals: { type: [String], default: [] },
    fitScore: { type: Number, default: 0 },
    recommendation: {
      type: String,
      enum: ["unscored", "prioritize", "consider", "skip"],
      default: "unscored",
    },
    lastSeenAt: { type: Date, default: Date.now },
    lastWorkflowAt: { type: Date, default: null },
  },
  { timestamps: true },
);

JobLeadSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export type JobLead = InferSchemaType<typeof JobLeadSchema>;

export const JobLeadModel: Model<JobLead> =
  mongoose.models.JobLead || mongoose.model<JobLead>("JobLead", JobLeadSchema);
