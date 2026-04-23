import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

const ApplicationEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "JobLead", required: true, index: true },
    evaluationId: { type: Schema.Types.ObjectId, ref: "JobEvaluation", default: null },
    type: {
      type: String,
      enum: [
        "lead_found",
        "enriched",
        "scored",
        "self_filtered",
        "tailored",
        "exported",
        "tracked",
        "followup_due",
        "context_updated",
      ],
      required: true,
      index: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type ApplicationEvent = InferSchemaType<typeof ApplicationEventSchema>;

export const ApplicationEventModel: Model<ApplicationEvent> =
  mongoose.models.ApplicationEvent ||
  mongoose.model<ApplicationEvent>("ApplicationEvent", ApplicationEventSchema);
