import { NextRequest, NextResponse } from "next/server";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedDraft, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { submitApplicationSchema } from "@/lib/auto-apply/types";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ applicationId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { applicationId } = await context.params;
  const draft = await loadOwnedDraft(auth.userId, applicationId);
  if (!draft) return NextResponse.json({ error: "Application draft not found." }, { status: 404 });

  const parsed = submitApplicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.confirmSubmit) {
    return NextResponse.json({ error: "Explicit final confirmation is required." }, { status: 400 });
  }

  const job = await AutoApplyJobCandidateModel.findOne({ _id: draft.jobCandidateId, userId: auth.userId });
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });
  const confirmedRestrictedSourceCompletion = job.riskFlags.includes("restricted_source_manual_guidance");

  await draft.updateOne({ $set: { finalReviewStatus: "submitted", submittedAt: new Date() } });
  await job.updateOne({ $set: { status: "submitted" } });
  await AutoApplySessionModel.findByIdAndUpdate(draft.sessionId, { $set: { status: "submitted" } });
  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: draft.sessionId.toString(),
    jobCandidateId: job._id.toString(),
    applicationDraftId: draft._id.toString(),
    type: "submitted",
    message: confirmedRestrictedSourceCompletion
      ? `Guided source application marked submitted for ${job.title} at ${job.company}.`
      : `Application marked submitted for ${job.title} at ${job.company}.`,
    payload: confirmedRestrictedSourceCompletion
      ? { riskFlags: job.riskFlags, completionMode: "guided_external_source" }
      : {},
  });

  return NextResponse.json({ submitted: true });
}
