import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { hashApplicationPayload } from "@/lib/auto-apply/prepare";
import { applyUserAnswer, countMissing, type DraftAnswer } from "@/lib/auto-apply/questions";
import { isAuthPayload, loadOwnedDraftByJob, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { assertTransition, normalizeStage, TransitionError, type JobStage } from "@/lib/auto-apply/state";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const draft = await loadOwnedDraftByJob(auth.userId, jobId);
  return NextResponse.json({
    job: { ...job.toObject(), questions: undefined, status: normalizeStage(job.status) },
    draft: draft
      ? {
          _id: draft._id,
          coverLetterText: draft.coverLetterText || "",
          // Drafts from before the engine rewrite may lack option lists and flags; give clients a stable shape.
          answers: (draft.toObject().answers || []).map((answer: Record<string, unknown>) => ({
            value: "",
            needsInput: false,
            required: false,
            type: "text",
            category: "other",
            ...answer,
            options: Array.isArray(answer.options) ? answer.options : [],
          })),
          applyUrl: draft.applyUrl,
          formSource: draft.formSource,
          finalReviewStatus: draft.finalReviewStatus,
          riskNotes: draft.riskNotes,
          generatedBy: draft.generatedBy,
          preparedAt: draft.preparedAt,
          approvedAt: draft.approvedAt,
        }
      : null,
  });
}

const stageActionSchema = z.object({
  stage: z.enum(["selected", "skipped", "shortlisted", "discovered"]).optional(),
  coverLetterText: z.string().max(8000).optional(),
  confirmCoverLetter: z.boolean().optional(),
  answers: z.array(z.object({ questionId: z.string().min(1), value: z.string().max(4000), remember: z.boolean().optional() })).max(80).optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const parsed = stageActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update." }, { status: 400 });
  const { stage, coverLetterText, answers, confirmCoverLetter } = parsed.data;
  const current = normalizeStage(job.status);

  try {
    if (stage) {
      assertTransition(current, stage as JobStage);
      await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: stage }, $push: { stageHistory: { stage, at: new Date(), note: "Changed by you" } } });
    }
    if (answers || confirmCoverLetter || typeof coverLetterText === "string") {
      if (current === "applied" || current === "preparing") {
        return NextResponse.json({ error: "This application can no longer be edited." }, { status: 409 });
      }
      const draft = await loadOwnedDraftByJob(auth.userId, jobId);
      if (!draft) return NextResponse.json({ error: "Prepare this application before editing it." }, { status: 409 });
      const existing = (draft.answers || []) as unknown as DraftAnswer[];
      const edits = new Map((answers || []).map((entry) => [entry.questionId, entry]));
      const cover = typeof coverLetterText === "string" ? coverLetterText : draft.coverLetterText;
      const next = existing.map((answer) => {
        const edit = edits.get(answer.questionId);
        if (edit) return applyUserAnswer(answer, edit.value);
        // Editing or confirming the letter is the applicant's review of anything flagged in it.
        if (answer.category === "cover_letter" && answer.type !== "file" && (confirmCoverLetter || typeof coverLetterText === "string")) return { ...answer, value: cover, needsInput: false, note: undefined };
        return answer;
      });
      const missing = countMissing(next);
      await draft.updateOne({
        $set: {
          answers: next,
          coverLetterText: cover,
          finalReviewStatus: missing ? "needs_input" : "ready",
          approvedAt: null,
          payloadHash: hashApplicationPayload({ answers: next, coverLetter: cover, applyUrl: draft.applyUrl }),
        },
      });
      const nextStage = missing ? "needs_input" : "prepared";
      if (current !== nextStage) {
        await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: nextStage, approvedAt: null }, $push: { stageHistory: { stage: nextStage, at: new Date(), note: "Edited by you" } } });
      }
      // "Remember" saves a reusable answer so the same question never needs input again.
      for (const entry of answers || []) {
        if (!entry.remember || !entry.value.trim()) continue;
        const answer = existing.find((candidate) => candidate.questionId === entry.questionId);
        if (!answer) continue;
        await AutoApplyMemoryModel.findOneAndUpdate(
          { userId: auth.userId, scope: "reusable_profile", questionPattern: answer.label },
          { $set: { answer: entry.value.trim(), source: "user", provenance: ["Auto Apply review"], confidence: 1, consentedAt: new Date(), sessionId: job.sessionId } },
          { upsert: true },
        );
      }
      await logAutoApplyEvent({ userId: auth.userId, sessionId: job.sessionId.toString(), jobCandidateId: job._id.toString(), type: "answers_edited", message: `Updated answers for ${job.title}.` });
    }
  } catch (error) {
    if (error instanceof TransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
