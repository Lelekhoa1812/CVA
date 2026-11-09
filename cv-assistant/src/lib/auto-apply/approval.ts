// Approval of prepared applications: the same rules for a click in the review step and for the auto-approve rule.
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { logAutoApplyEvent } from "./persistence";
import { hashApplicationPayload } from "./prepare";
import { countMissing, type DraftAnswer } from "./questions";
import { autoApplyFiltersSchema } from "./types";

/** A model-written answer below this confidence is not approved without a person looking at it. */
export const AUTO_APPROVE_MIN_ANSWER_CONFIDENCE = 0.75;

type DraftLike = { answers?: unknown; riskNotes?: string[]; letterClaims?: string[]; coverLetterText?: string };

/**
 * Why a draft must be read by the applicant before it is approved. An empty list means nothing in it needs a person:
 * every answer is filled, the letter has no claim left to check, and no model-written answer is a weak guess.
 */
export function autoApprovalBlockers(draft: DraftLike): string[] {
  const answers = (Array.isArray(draft.answers) ? draft.answers : []) as DraftAnswer[];
  const reasons: string[] = [];
  const missing = countMissing(answers);
  if (missing) reasons.push(`${missing} answer${missing === 1 ? " is" : "s are"} still missing`);
  const letterField = answers.find((answer) => answer.category === "cover_letter" && answer.type !== "file");
  if (letterField && !(draft.coverLetterText || "").trim()) reasons.push("The cover letter is empty");
  if ((draft.letterClaims || []).length) reasons.push("The cover letter has claims to check");
  for (const note of draft.riskNotes || []) {
    const text = note.replace(/^Cover letter:\s*/i, "").replace(/\s+/g, " ").trim();
    if (text) reasons.push(text.length > 140 ? `${text.slice(0, 137)}...` : text);
  }
  const weak = answers.filter((answer) => answer.source === "ai" && answer.value.trim() && answer.confidence < AUTO_APPROVE_MIN_ANSWER_CONFIDENCE);
  if (weak.length) reasons.push(`${weak.length} written answer${weak.length === 1 ? " is" : "s are"} a low-confidence guess: ${weak.slice(0, 2).map((answer) => answer.label.slice(0, 50)).join("; ")}`);
  return reasons;
}

export type ApprovalResult = { ok: true } | { ok: false; reason: string | null };

/** Approves one prepared application. `reason: null` means another request already acted on it. */
export async function approvePreparedJob(args: { jobId: string; userId: string; reviewedHash?: string; note?: string }): Promise<ApprovalResult> {
  await connectToDatabase();
  const draft = await AutoApplyApplicationDraftModel.findOne({ jobCandidateId: args.jobId, userId: args.userId });
  if (!draft) return { ok: false, reason: "No prepared application" };
  const answers = (draft.answers || []) as unknown as DraftAnswer[];
  if (countMissing(answers)) return { ok: false, reason: "Some answers are still missing" };
  const hash = hashApplicationPayload({ answers, coverLetter: draft.coverLetterText, applyUrl: draft.applyUrl });
  if (args.reviewedHash && args.reviewedHash !== hash) return { ok: false, reason: "Changed since you reviewed it" };
  // Atomic claim: concurrent approvals of the same job act once.
  const claimed = await AutoApplyJobCandidateModel.updateOne(
    { _id: args.jobId, userId: args.userId, status: "prepared" },
    { $set: { status: "approved", approvedAt: new Date() }, $push: { stageHistory: { stage: "approved", at: new Date(), note: args.note || "Approved" } } },
  );
  if (!claimed.modifiedCount) return { ok: false, reason: null };
  await draft.updateOne({ $set: { finalReviewStatus: "approved", approvedAt: new Date(), payloadHash: hash } });
  return { ok: true };
}

/**
 * The auto-approve rule: approves every prepared application of the session whose fit meets the applicant's threshold and
 * whose draft has nothing left for a person to check. Drafts that fail stay in review, with the reason in the activity log.
 */
export async function autoApproveReady(args: { sessionId: string; userId: string }): Promise<{ approved: number; held: number }> {
  await connectToDatabase();
  const session = await AutoApplySessionModel.findOne({ _id: args.sessionId, userId: args.userId }).lean();
  if (!session) return { approved: 0, held: 0 };
  const minFit = autoApplyFiltersSchema.parse(session.filters || {}).autoApproveMinFit;
  if (!minFit) return { approved: 0, held: 0 };
  const jobs = await AutoApplyJobCandidateModel.find({ sessionId: args.sessionId, userId: args.userId, status: "prepared", fitScore: { $gte: minFit } }).select("_id title company").lean();
  let approved = 0;
  let held = 0;
  for (const job of jobs) {
    const draft = await AutoApplyApplicationDraftModel.findOne({ jobCandidateId: job._id, userId: args.userId }).lean();
    if (!draft) continue;
    const blockers = autoApprovalBlockers(draft as unknown as DraftLike);
    if (blockers.length) {
      held += 1;
      // The rule runs after every batch of answers: say it once per reason, not once per run.
      const message = `${job.title} at ${job.company} needs your eyes: ${blockers[0]}.`;
      const already = await AutoApplyEventModel.exists({ sessionId: args.sessionId, jobCandidateId: job._id, type: "auto_approve_held", message });
      if (!already) await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, jobCandidateId: job._id.toString(), type: "auto_approve_held", message });
      continue;
    }
    const result = await approvePreparedJob({ jobId: job._id.toString(), userId: args.userId, note: "Approved automatically: complete, no claims to check" });
    if (result.ok) {
      approved += 1;
      await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, jobCandidateId: job._id.toString(), type: "auto_approved", message: `Approved automatically: ${job.title} at ${job.company}.` });
    }
  }
  return { approved, held };
}
