import { NextRequest, NextResponse } from "next/server";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedDraftByJob, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { normalizeStage } from "@/lib/auto-apply/state";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records that the candidate submitted the application on the employer's site. The engine cannot see the
// employer's confirmation page, so this is the candidate's own attestation and is labelled that way everywhere.
export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean; undo?: boolean };

  const stage = normalizeStage(job.status);
  if (body.undo) {
    if (stage !== "applied") return NextResponse.json({ error: "This application is not marked as applied." }, { status: 409 });
    await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: "approved", appliedAt: null }, $push: { stageHistory: { stage: "approved", at: new Date(), note: "Applied status undone" } } });
    return NextResponse.json({ stage: "approved" });
  }
  if (!body.confirm) return NextResponse.json({ error: "Confirm that you submitted this application." }, { status: 400 });
  if (stage === "applied") return NextResponse.json({ stage: "applied", already: true });
  if (stage !== "approved") return NextResponse.json({ error: "Approve this application before marking it applied." }, { status: 409 });

  const draft = await loadOwnedDraftByJob(auth.userId, jobId);
  await draft?.updateOne({ $set: { finalReviewStatus: "applied", submittedAt: new Date() } });
  await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: "applied", appliedAt: new Date() }, $push: { stageHistory: { stage: "applied", at: new Date(), note: "Marked applied by candidate" } } });
  await logAutoApplyEvent({ userId: auth.userId, sessionId: job.sessionId.toString(), jobCandidateId: job._id.toString(), type: "applied", message: `Marked applied: ${job.title} at ${job.company}.` });
  return NextResponse.json({ stage: "applied" });
}
