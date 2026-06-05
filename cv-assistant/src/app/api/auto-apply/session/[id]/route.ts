import { NextRequest, NextResponse } from "next/server";
import { buildGroundTruthSnapshot } from "@/lib/auto-apply/ground-truth";
import { suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";
import {
  isAuthPayload,
  loadOwnedSession,
  requireAutoApplyAuth,
} from "@/lib/auto-apply/routes";
import { updateAutoApplySessionSchema } from "@/lib/auto-apply/types";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";
import { UserModel, type Profile } from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const [jobs, drafts, memories, events] = await Promise.all([
    AutoApplyJobCandidateModel.find({ userId: auth.userId, sessionId: id }).sort({ fitScore: -1 }).lean(),
    AutoApplyApplicationDraftModel.find({ userId: auth.userId, sessionId: id }).sort({ updatedAt: -1 }).lean(),
    AutoApplyMemoryModel.find({ userId: auth.userId, sessionId: id }).sort({ updatedAt: -1 }).lean(),
    AutoApplyEventModel.find({ userId: auth.userId, sessionId: id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  return NextResponse.json({ session, jobs, drafts, memories, events: events.reverse() });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const parsed = updateAutoApplySessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid session update." },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.selectedGroundTruthIds || typeof parsed.data.allowFullResumeContext === "boolean") {
    const user = await UserModel.findById(auth.userId).lean();
    const selectedIds =
      parsed.data.selectedGroundTruthIds && parsed.data.selectedGroundTruthIds.length > 0
        ? parsed.data.selectedGroundTruthIds
        : parsed.data.allowFullResumeContext
          ? session.selectedGroundTruthIds
          : suggestGroundTruthSelection(
              user?.profile as Partial<Profile> | undefined,
              parsed.data.prompt || session.prompt,
            );
    update.sessionGroundTruthSnapshot = buildGroundTruthSnapshot(
      user?.profile as Partial<Profile> | undefined,
      selectedIds,
      parsed.data.allowFullResumeContext ?? session.allowFullResumeContext,
    );
    update.selectedGroundTruthIds = selectedIds;
  }

  const updated = await session.updateOne({ $set: update });
  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: id,
    type: "session_updated",
    message: "Auto Apply session updated.",
    payload: { modifiedCount: updated.modifiedCount },
  });

  return NextResponse.json({ session: await loadOwnedSession(auth.userId, id) });
}
