import { isValidObjectId } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { hashApplicationPayload } from "@/lib/auto-apply/prepare";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { countMissing, type DraftAnswer } from "@/lib/auto-apply/questions";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Batch approval: approves every prepared application (or the listed ones) whose answers are complete.
// The approved payload is hashed so what the user approved is exactly what the autofill pack contains.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // A malformed or ambiguous body must never widen the approval to the whole session: it names the jobs or says `all`.
  let body: { jobIds?: unknown; undo?: boolean; all?: boolean; reviewedHashes?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  const jobIds = Array.isArray(body.jobIds) ? body.jobIds.filter((value): value is string => typeof value === "string" && isValidObjectId(value)) : null;
  if (body.jobIds !== undefined && (!Array.isArray(body.jobIds) || jobIds?.length !== body.jobIds.length)) return NextResponse.json({ error: "jobIds must be an array of job ids." }, { status: 400 });
  if (!jobIds && body.all !== true) return NextResponse.json({ error: "List jobIds or pass all: true." }, { status: 400 });
  const filter: Record<string, unknown> = { sessionId: id, userId: auth.userId, status: body.undo ? "approved" : "prepared" };
  if (jobIds) filter._id = { $in: jobIds };
  const jobs = await AutoApplyJobCandidateModel.find(filter).select("_id title company").lean();

  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const job of jobs) {
    const draft = await AutoApplyApplicationDraftModel.findOne({ jobCandidateId: job._id, userId: auth.userId });
    if (!draft) {
      skipped.push({ id: job._id.toString(), reason: "No prepared application" });
      continue;
    }
    if (body.undo) {
      await draft.updateOne({ $set: { finalReviewStatus: "ready", approvedAt: null } });
      await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: "prepared", approvedAt: null }, $push: { stageHistory: { stage: "prepared", at: new Date(), note: "Approval withdrawn" } } });
      approved.push(job._id.toString());
      continue;
    }
    const answers = (draft.answers || []) as unknown as DraftAnswer[];
    if (countMissing(answers)) {
      skipped.push({ id: job._id.toString(), reason: "Some answers are still missing" });
      continue;
    }
    const hash = hashApplicationPayload({ answers, coverLetter: draft.coverLetterText, applyUrl: draft.applyUrl });
    const reviewed = body.reviewedHashes?.[job._id.toString()];
    if (reviewed && reviewed !== hash) {
      skipped.push({ id: job._id.toString(), reason: "Changed since you reviewed it" });
      continue;
    }
    // Atomic claim: concurrent approvals of the same job act once.
    const claimed = await AutoApplyJobCandidateModel.updateOne({ _id: job._id, status: "prepared" }, { $set: { status: "approved", approvedAt: new Date() }, $push: { stageHistory: { stage: "approved", at: new Date(), note: "Approved" } } });
    if (!claimed.modifiedCount) continue;
    await draft.updateOne({ $set: { finalReviewStatus: "approved", approvedAt: new Date(), payloadHash: hash } });
    approved.push(job._id.toString());
  }
  if (approved.length) {
    await logAutoApplyEvent({ userId: auth.userId, sessionId: id, type: body.undo ? "approval_withdrawn" : "approved", message: `${body.undo ? "Withdrew approval for" : "Approved"} ${approved.length} application${approved.length === 1 ? "" : "s"}.` });
    await session.updateOne({ $set: { status: "review" } });
  }
  return NextResponse.json({ approved, skipped });
}
