import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const GeneratedArtifactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "JobLead", required: true, index: true },
    tailoringRunId: { type: Schema.Types.ObjectId, ref: "TailoringRun", required: true, index: true },
    artifactType: {
      type: String,
      enum: ["resume_html", "resume_json", "cover_letter_html"],
      required: true,
    },
    variant: { type: String, default: "executive" },
    mimeType: { type: String, default: "text/html" },
    body: { type: String, default: "" },
    summary: { type: String, default: "" },
    lineageVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export type GeneratedArtifact = InferSchemaType<typeof GeneratedArtifactSchema>;

export const GeneratedArtifactModel: Model<GeneratedArtifact> =
  mongoose.models.GeneratedArtifact ||
  mongoose.model<GeneratedArtifact>("GeneratedArtifact", GeneratedArtifactSchema);
