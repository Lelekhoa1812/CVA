import { connectToDatabase } from "@/lib/db";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { UserModel, type Profile } from "@/lib/models/User";
import { buildGroundTruthSnapshot, suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";

export async function logAutoApplyEvent(args: {
  userId: string;
  sessionId: string;
  type: string;
  message: string;
  jobCandidateId?: string | null;
  applicationDraftId?: string | null;
  payload?: Record<string, unknown>;
}) {
  return AutoApplyEventModel.create({
    userId: args.userId,
    sessionId: args.sessionId,
    type: args.type,
    message: args.message,
    jobCandidateId: args.jobCandidateId || null,
    applicationDraftId: args.applicationDraftId || null,
    payload: args.payload || {},
  });
}

export async function createSessionWithSnapshot(args: {
  userId: string;
  mode: "ai_coaching" | "manual_curate";
  prompt: string;
  filters: Record<string, unknown>;
  selectedGroundTruthIds: string[];
  allowFullResumeContext: boolean;
}) {
  await connectToDatabase();
  const user = await UserModel.findById(args.userId).lean();
  const profile = user?.profile as Partial<Profile> | undefined;
  const selectedGroundTruthIds =
    args.selectedGroundTruthIds.length || args.allowFullResumeContext
      ? args.selectedGroundTruthIds
      : suggestGroundTruthSelection(profile, args.prompt, 8);
  const snapshot = buildGroundTruthSnapshot(profile, selectedGroundTruthIds, args.allowFullResumeContext);

  const session = await AutoApplySessionModel.create({
    userId: args.userId,
    mode: args.mode,
    prompt: args.prompt,
    filters: args.filters,
    selectedGroundTruthIds,
    allowFullResumeContext: args.allowFullResumeContext,
    sessionGroundTruthSnapshot: snapshot,
  });

  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: session._id.toString(),
    type: "session_created",
    message: "Auto Apply session created.",
  });

  return session;
}
