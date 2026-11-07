import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { crawlJobDescription } from "@/lib/auto-apply/jd";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { hashApplicationPayload } from "@/lib/auto-apply/prepare";
import { countMissing, type DraftAnswer } from "@/lib/auto-apply/questions";
import { isAuthPayload, loadOwnedDraftByJob, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { runCoverLetterAgent } from "@/lib/cover-letter-service";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { UserModel, type Profile } from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ advanced: z.boolean().optional() });

/** Rewrites one application's cover letter with the same agent as the /generate studio, optionally in advanced mode. */
export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (["applied", "approved", "preparing"].includes(job.status)) {
    return NextResponse.json({ error: "Withdraw the approval before rewriting the cover letter." }, { status: 409 });
  }
  const draft = await loadOwnedDraftByJob(auth.userId, jobId);
  if (!draft) return NextResponse.json({ error: "Prepare this application first." }, { status: 409 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const advanced = parsed.success ? Boolean(parsed.data.advanced) : false;

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as Partial<Profile> | undefined;
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(250_000)]);

  try {
    const crawled = await crawlJobDescription({
      description: job.descriptionText || "",
      urls: [draft.applyUrl, job.applyUrl, job.url],
      signal,
    });
    const result = await runCoverLetterAgent({
      profile,
      company: job.company,
      title: job.title,
      jobDescription: crawled.text || job.descriptionText || "",
      advanced,
      signal,
    });
    if (!result.text) return NextResponse.json({ error: "The cover letter agent returned nothing. Try again." }, { status: 502 });

    const answers = ((draft.toObject().answers || []) as unknown as DraftAnswer[]).map((answer) =>
      answer.category === "cover_letter" && answer.type !== "file" ? { ...answer, value: result.text, needsInput: Boolean(result.unsupportedClaims?.length), note: result.unsupportedClaims?.length ? `Check before approving: the letter mentions ${result.unsupportedClaims.join(", ")}, which is not in your profile. Edit or confirm it.` : undefined } : answer,
    );
    const missing = countMissing(answers) + (result.unsupportedClaims?.length ? 1 : 0);
    await draft.updateOne({
      $set: {
        answers,
        coverLetterText: result.text,
        generatedBy: result.model,
        letterClaims: result.unsupportedClaims || [],
        riskNotes: [
          ...(draft.riskNotes || []).filter((note: string) => !note.startsWith("Cover letter:")),
          ...(result.reviewWarning ? [`Cover letter: ${result.reviewWarning}`] : []),
          ...(result.fallbackNote ? [`Cover letter: ${result.fallbackNote}`] : []),
        ],
        finalReviewStatus: missing ? "needs_input" : "ready",
        approvedAt: null,
        payloadHash: hashApplicationPayload({ answers, coverLetter: result.text, applyUrl: draft.applyUrl }),
      },
    });
    const nextStage = missing ? "needs_input" : "prepared";
    if (job.status !== nextStage) {
      await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: nextStage }, $push: { stageHistory: { stage: nextStage, at: new Date(), note: "Cover letter rewritten" } } });
    }
    await logAutoApplyEvent({
      userId: auth.userId,
      sessionId: job.sessionId.toString(),
      jobCandidateId: job._id.toString(),
      type: "cover_letter_rewritten",
      message: `Rewrote the cover letter for ${job.title}${advanced ? " with the advanced agent" : ""}.`,
    });
    return NextResponse.json({ coverLetter: result.text, mode: result.mode, reviewWarning: result.reviewWarning, fallbackNote: result.fallbackNote, jdSource: crawled.source });
  } catch (error) {
    if (req.signal.aborted) throw error;
    return NextResponse.json({ error: "Cover letter generation is temporarily unavailable. Try again in a moment." }, { status: 502 });
  }
}
