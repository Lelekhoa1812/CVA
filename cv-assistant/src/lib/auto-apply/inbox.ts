// "Answer once, apply to all": the questions several applications are waiting on, grouped so one answer fills every one of them.
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";
import { UserModel } from "@/lib/models/User";
import { autoApproveReady } from "./approval";
import { logAutoApplyEvent } from "./persistence";
import { hashApplicationPayload } from "./prepare";
import { applyUserAnswer, countMissing, normalizeQuestionLabel, type ApplicantPreferences, type DraftAnswer, type FormQuestionType, type QuestionCategory } from "./questions";

export type OpenQuestionItem = { jobId: string; title: string; company: string; questionId: string };
export type OpenQuestionGroup = {
  key: string;
  label: string;
  category: QuestionCategory;
  type: FormQuestionType;
  required: boolean;
  /** The option labels every application offers, or empty when the forms word the choices differently (answer in words then). */
  options: string[];
  sensitive: boolean;
  note?: string;
  /** Standard personal questions are worth saving to the standing answers; one-off questions are not. */
  rememberDefault: boolean;
  items: OpenQuestionItem[];
};

/** Categories whose question is the same whatever the employer calls it, so one answer serves every form. */
const POOLED: Partial<Record<QuestionCategory, keyof ApplicantPreferences>> = {
  work_rights: "workRights",
  sponsorship: "requiresSponsorship",
  salary: "salaryExpectation",
  notice: "noticePeriod",
  relocation: "willingToRelocate",
  workplace: "hybridOk",
  source: "howHeard",
};
const YES_NO_PREFERENCES = new Set<keyof ApplicantPreferences>(["requiresSponsorship", "willingToRelocate", "hybridOk"]);

export function groupKeyFor(answer: Pick<DraftAnswer, "category" | "label" | "options">) {
  if (POOLED[answer.category]) return `${answer.category}:${answer.options.length ? "choice" : "text"}`;
  return `label:${normalizeQuestionLabel(answer.label)}`;
}

export function groupOpenQuestions(entries: Array<{ job: { id: string; title: string; company: string }; answers: DraftAnswer[] }>): OpenQuestionGroup[] {
  const groups = new Map<string, OpenQuestionGroup & { optionSets: string[] }>();
  for (const { job, answers } of entries) {
    for (const answer of answers) {
      if (!answer.needsInput) continue;
      const key = groupKeyFor(answer);
      const labels = answer.options.map((option) => option.label);
      const existing = groups.get(key);
      const item = { jobId: job.id, title: job.title, company: job.company, questionId: answer.questionId };
      if (!existing) {
        groups.set(key, {
          key,
          label: answer.label,
          category: answer.category,
          type: answer.type,
          required: answer.required,
          options: labels,
          optionSets: [labels.slice().sort().join("|")],
          sensitive: answer.sensitive,
          note: answer.note,
          rememberDefault: Boolean(POOLED[answer.category]),
          items: [item],
        });
        continue;
      }
      existing.items.push(item);
      existing.required = existing.required || answer.required;
      existing.optionSets.push(labels.slice().sort().join("|"));
    }
  }
  return [...groups.values()]
    .map(({ optionSets, ...group }) => ({ ...group, options: new Set(optionSets).size === 1 ? group.options : [] }))
    .sort((left, right) => right.items.length - left.items.length || left.label.localeCompare(right.label));
}

async function loadEntries(sessionId: string, userId: string) {
  await connectToDatabase();
  const jobs = await AutoApplyJobCandidateModel.find({ sessionId, userId, status: "needs_input" }).select("_id title company").lean();
  const drafts = await AutoApplyApplicationDraftModel.find({ userId, jobCandidateId: { $in: jobs.map((job) => job._id) } });
  const byJob = new Map(drafts.map((draft) => [draft.jobCandidateId.toString(), draft]));
  return jobs.flatMap((job) => {
    const draft = byJob.get(job._id.toString());
    return draft ? [{ job: { id: job._id.toString(), title: job.title, company: job.company }, draft, answers: (draft.answers || []) as unknown as DraftAnswer[] }] : [];
  });
}

export async function loadOpenQuestions(args: { sessionId: string; userId: string }) {
  const entries = await loadEntries(args.sessionId, args.userId);
  return groupOpenQuestions(entries);
}

function preferenceValue(field: keyof ApplicantPreferences, value: string) {
  if (!YES_NO_PREFERENCES.has(field)) return value;
  if (/^(yes|y|true)$/i.test(value)) return "yes";
  if (/^(no|n|false)$/i.test(value)) return "no";
  return "";
}

/** Answers one grouped question in every application that is waiting on it. Returns how many answers were filled and how many are still open. */
export async function answerOpenQuestion(args: { sessionId: string; userId: string; key: string; value: string; remember: boolean }) {
  const value = args.value.trim();
  if (!value) throw new Error("Give an answer first.");
  const entries = await loadEntries(args.sessionId, args.userId);
  const group = groupOpenQuestions(entries).find((candidate) => candidate.key === args.key);
  if (!group) return { filled: 0, stillOpen: 0 };
  const wanted = new Map<string, Set<string>>();
  for (const item of group.items) wanted.set(item.jobId, (wanted.get(item.jobId) || new Set()).add(item.questionId));

  let filled = 0;
  let stillOpen = 0;
  const labels = new Set<string>();
  for (const { job, draft, answers } of entries) {
    const ids = wanted.get(job.id);
    if (!ids) continue;
    const next = answers.map((answer) => {
      if (!ids.has(answer.questionId)) return answer;
      const updated = applyUserAnswer(answer, value);
      if (updated.needsInput) stillOpen += 1;
      else {
        filled += 1;
        labels.add(answer.label);
      }
      return updated;
    });
    const missing = countMissing(next);
    await draft.updateOne({
      $set: {
        answers: next,
        finalReviewStatus: missing ? "needs_input" : "ready",
        approvedAt: null,
        payloadHash: hashApplicationPayload({ answers: next, coverLetter: draft.coverLetterText, applyUrl: draft.applyUrl }),
      },
    });
    if (!missing) {
      await AutoApplyJobCandidateModel.updateOne({ _id: job.id, status: "needs_input" }, { $set: { status: "prepared" }, $push: { stageHistory: { stage: "prepared", at: new Date(), note: "Answered once for all applications" } } });
    }
  }

  if (args.remember && filled) {
    for (const label of labels) {
      await AutoApplyMemoryModel.findOneAndUpdate(
        { userId: args.userId, scope: "reusable_profile", questionPattern: label },
        { $set: { answer: value, source: "user", provenance: ["Auto Apply open questions"], confidence: 1, consentedAt: new Date(), sessionId: args.sessionId } },
        { upsert: true },
      );
    }
    const field = POOLED[group.category];
    const stored = field ? preferenceValue(field, value) : "";
    if (field && stored) await UserModel.updateOne({ _id: args.userId }, { $set: { [`autoApplyPreferences.${field}`]: stored } });
  }
  await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "answered_once", message: `Answered "${group.label.slice(0, 80)}" once for ${filled} application${filled === 1 ? "" : "s"}.` });
  if (filled) await autoApproveReady({ sessionId: args.sessionId, userId: args.userId }).catch(() => undefined);
  return { filled, stillOpen };
}
