import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const AutoApplyUploadedFileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AutoApplySession",
      required: true,
      index: true,
    },
    kind: { type: String, enum: ["resume", "supporting_document"], required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    checksum: { type: String, required: true, index: true },
    data: { type: Buffer, required: true },
    parsedText: { type: String, default: "" },
    parseStatus: {
      type: String,
      enum: ["pending", "parsed", "failed", "unsupported"],
      default: "pending",
    },
    parseError: { type: String, default: "" },
  },
  { timestamps: true },
);

export type AutoApplyUploadedFile = InferSchemaType<typeof AutoApplyUploadedFileSchema>;

export const AutoApplyUploadedFileModel: Model<AutoApplyUploadedFile> =
  mongoose.models.AutoApplyUploadedFile ||
  mongoose.model<AutoApplyUploadedFile>("AutoApplyUploadedFile", AutoApplyUploadedFileSchema);
