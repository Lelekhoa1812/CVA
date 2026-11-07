import { NextRequest, NextResponse } from "next/server";
import { buildGroundTruthSnapshot, suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { countStages, deriveSessionPhase, isRunStalled, normalizeStage, withJobDefaults } from "@/lib/auto-apply/state";
import { autoApplyFiltersSchema, updateAutoApplySessionSchema } from "@/lib/auto-apply/types";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { UserModel, type Profile } from "@/lib/models/User";
import type { DraftAnswer } from "@/lib/auto-apply/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  let session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // A run whose serverless function was cut off never reports again. Recover it so the workspace is not stuck.
  if (isRunStalled(session.run)) {
    await AutoApplySessionModel.updateOne(
      { _id: id, userId: auth.userId, "run.updatedAt": session.run?.updatedAt ?? null },
      { $set: { "run.phase": "idle", "run.message": "The last run stopped early. Press Prepare to continue where it left off.", "run.updatedAt": new Date(), status: "review" } },
    );
    await AutoApplyJobCandidateModel.updateMany({ userId: auth.userId, sessionId: id, status: "preparing" }, { $set: { status: "selected", preparingStartedAt: null } });
    session = (await loadOwnedSession(auth.userId, id)) || session;
  }

  const [jobs, drafts, events] = await Promise.all([
    AutoApplyJobCandidateModel.find({ userId: auth.userId, sessionId: id })
      .select("-descriptionText -questions -stageHistory -resolutionNotes")
      .sort({ fitScore: -1 })
      .lean(),
    AutoApplyApplicationDraftModel.find({ userId: auth.userId, sessionId: id }).select("jobCandidateId answers finalReviewStatus applyUrl formSource coverLetterText").lean(),
    AutoApplyEventModel.find({ userId: auth.userId, sessionId: id }).sort({ createdAt: -1 }).limit(40).lean(),
  ]);
  const draftByJob = new Map(drafts.map((draft) => [draft.jobCandidateId.toString(), draft]));
  const slim = jobs.map((job) => {
    const draft = draftByJob.get(job._id.toString());
    const answers = ((draft?.answers || []) as unknown as DraftAnswer[]);
    return {
      ...withJobDefaults(job as unknown as Record<string, unknown>),
      status: normalizeStage(job.status),
      missingAnswers: answers.filter((answer) => answer.needsInput).length,
      answerCount: answers.length,
      hasCoverLetter: Boolean(draft?.coverLetterText),
    };
  });
  const counts = countStages(slim.map((job) => job.status));
  const phase = deriveSessionPhase(session.run?.phase, counts);
  return NextResponse.json({
    session: { ...session.toObject(), sessionGroundTruthSnapshot: undefined },
    jobs: slim,
    counts,
    phase,
    events: events.reverse(),
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (["searching", "scoring", "preparing"].includes(session.run?.phase || "")) {
    return NextResponse.json({ error: "Wait for the current run to finish before changing settings." }, { status: 409 });
  }
  const parsed = updateAutoApplySessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid session update." }, { status: 400 });

  // Status is system-owned: it is never accepted from the client. Filters are merged, not replaced.
  const update: Record<string, unknown> = {};
  if (parsed.data.mode) update.mode = parsed.data.mode;
  if (typeof parsed.data.prompt === "string" && parsed.data.prompt.trim()) update.prompt = parsed.data.prompt.trim();
  if (parsed.data.filters) update.filters = autoApplyFiltersSchema.parse({ ...(session.filters as object), ...parsed.data.filters });
  if (parsed.data.selectedGroundTruthIds || typeof parsed.data.allowFullResumeContext === "boolean") {
    const user = await UserModel.findById(auth.userId).lean();
    const profile = user?.profile as Partial<Profile> | undefined;
    const allowFull = parsed.data.allowFullResumeContext ?? session.allowFullResumeContext;
    const selectedIds = parsed.data.selectedGroundTruthIds?.length
      ? parsed.data.selectedGroundTruthIds
      : suggestGroundTruthSelection(profile, parsed.data.prompt || session.prompt, 8);
    update.sessionGroundTruthSnapshot = buildGroundTruthSnapshot(profile, selectedIds, allowFull);
    update.selectedGroundTruthIds = selectedIds;
    update.allowFullResumeContext = allowFull;
  }
  await session.updateOne({ $set: update });
  await logAutoApplyEvent({ userId: auth.userId, sessionId: id, type: "session_updated", message: "Search settings updated." });
  const fresh = await loadOwnedSession(auth.userId, id);
  return NextResponse.json({ session: fresh });
}
