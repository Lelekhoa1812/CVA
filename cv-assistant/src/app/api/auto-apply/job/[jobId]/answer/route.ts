import { NextRequest, NextResponse } from "next/server";
import { answerEmployerQuestionFromGroundTruth } from "@/lib/auto-apply/answering";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { answerQuestionSchema } from "@/lib/auto-apply/types";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });

  const parsed = answerQuestionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid question." }, { status: 400 });
  }

  const session = await AutoApplySessionModel.findOne({ _id: job.sessionId, userId: auth.userId });
  const savedAnswers = await AutoApplyMemoryModel.find({
    userId: auth.userId,
    $or: [{ sessionId: job.sessionId }, { scope: "reusable_profile" }],
  }).lean();

  const answer = answerEmployerQuestionFromGroundTruth({
    question: parsed.data.question,
    groundTruthSnapshot: (session?.sessionGroundTruthSnapshot || {}) as { items?: [] },
    savedAnswers,
  });

  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: job.sessionId.toString(),
    jobCandidateId: job._id.toString(),
    type: answer.requiresUserReview ? "clarification_required" : "answer_generated",
    message: answer.requiresUserReview
      ? "Paused: employer question requires your input or review."
      : "Generated employer question answer from saved evidence.",
    payload: { question: parsed.data.question, answer },
  });

  return NextResponse.json({ answer });
}
