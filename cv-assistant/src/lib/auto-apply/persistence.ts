import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { AutoApplyUploadedFileModel } from "@/lib/models/AutoApplyUploadedFile";
import { UserModel, type Profile } from "@/lib/models/User";
import { buildGroundTruthSnapshot, suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";
import { rankAutoApplyCandidates, type RankableJob, type RankedJob } from "@/lib/auto-apply/ranking";

export async function logAutoApplyEvent(args: {
  userId: string;
  sessionId: string;
  type: string;
  message: string;
  jobCandidateId?: string | null;
  applicationDraftId?: string | null;
  payload?: Record<string, unknown>;
}) {
  return AutoApplyEventModel.create({
    userId: args.userId,
    sessionId: args.sessionId,
    type: args.type,
    message: args.message,
    jobCandidateId: args.jobCandidateId || null,
    applicationDraftId: args.applicationDraftId || null,
    payload: args.payload || {},
  });
}

export async function getUserSession(userId: string, sessionId: string) {
  await connectToDatabase();
  return AutoApplySessionModel.findOne({ _id: sessionId, userId });
}

export async function createSessionWithSnapshot(args: {
  userId: string;
  mode: "ai_coaching" | "manual_curate";
  prompt: string;
  filters: Record<string, unknown>;
  selectedGroundTruthIds: string[];
  allowFullResumeContext: boolean;
}) {
  await connectToDatabase();
  const user = await UserModel.findById(args.userId).lean();
  const profile = user?.profile as Partial<Profile> | undefined;
  const selectedGroundTruthIds =
    args.selectedGroundTruthIds.length || args.allowFullResumeContext
      ? args.selectedGroundTruthIds
      : suggestGroundTruthSelection(profile, args.prompt);
  const snapshot = buildGroundTruthSnapshot(
    profile,
    selectedGroundTruthIds,
    args.allowFullResumeContext,
  );

  const session = await AutoApplySessionModel.create({
    userId: args.userId,
    mode: args.mode,
    prompt: args.prompt,
    filters: args.filters,
    selectedGroundTruthIds,
    allowFullResumeContext: args.allowFullResumeContext,
    sessionGroundTruthSnapshot: snapshot,
  });

  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: session._id.toString(),
    type: "session_created",
    message: "Auto Apply session created.",
  });

  return session;
}

async function parseUploadedText(buffer: Buffer, mimeType: string, filename: string) {
  if (mimeType === "text/plain" || filename.toLowerCase().endsWith(".txt")) {
    return { parsedText: buffer.toString("utf8"), parseStatus: "parsed" as const };
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { parsedText: result.value.trim(), parseStatus: "parsed" as const };
  }

  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    return {
      parsedText: "",
      parseStatus: "pending" as const,
      parseError: "PDF raw bytes stored; text extraction deferred to document-capable model.",
    };
  }

  return {
    parsedText: "",
    parseStatus: "unsupported" as const,
    parseError: "Unsupported document type for text extraction.",
  };
}

export async function storeAutoApplyFile(args: {
  userId: string;
  sessionId: string;
  file: File;
  kind: "resume" | "supporting_document";
}) {
  await connectToDatabase();
  const buffer = Buffer.from(await args.file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const parsed = await parseUploadedText(buffer, args.file.type, args.file.name);

  const uploaded = await AutoApplyUploadedFileModel.create({
    userId: args.userId,
    sessionId: args.sessionId,
    kind: args.kind,
    filename: args.file.name,
    mimeType: args.file.type || "application/octet-stream",
    size: buffer.byteLength,
    checksum,
    data: buffer,
    ...parsed,
  });

  await AutoApplySessionModel.findOneAndUpdate(
    { _id: args.sessionId, userId: args.userId },
    args.kind === "resume"
      ? { $set: { uploadedResumeId: uploaded._id } }
      : { $addToSet: { uploadedAdditionalDocumentIds: uploaded._id } },
  );

  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: args.sessionId,
    type: "file_uploaded",
    message:
      args.kind === "resume"
        ? "Resume uploaded and stored for this session."
        : "Supporting document uploaded and stored for this session.",
    payload: { filename: args.file.name, kind: args.kind, parseStatus: uploaded.parseStatus },
  });

  return uploaded;
}

export async function upsertRankedCandidates(args: {
  userId: string;
  sessionId: string;
  jobs: RankableJob[];
  prompt: string;
  filters: {
    mustHaveKeywords?: string[];
    excludeKeywords?: string[];
    companyBlacklist?: string[];
  };
}) {
  const session = await getUserSession(args.userId, args.sessionId);
  if (!session) throw new Error("Session not found.");

  const ranked = rankAutoApplyCandidates({
    jobs: args.jobs,
    prompt: args.prompt,
    groundTruthSnapshot: session.sessionGroundTruthSnapshot as { items?: [] },
    mustHaveKeywords: args.filters.mustHaveKeywords,
    excludeKeywords: args.filters.excludeKeywords,
    companyBlacklist: args.filters.companyBlacklist,
  });

  const docs = await Promise.all(
    ranked.map((job: RankedJob) =>
      AutoApplyJobCandidateModel.findOneAndUpdate(
        { sessionId: args.sessionId, dedupeKey: job.dedupeKey },
        {
          $set: {
            userId: args.userId,
            sessionId: args.sessionId,
            source: job.source,
            sourceJobId: job.id || "",
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.listingUrl || "",
            applyUrl: job.applicationUrl || "",
            applyUrlType: job.applicationUrlType || "listing",
            descriptionText: job.descriptionText || job.snippet || "",
            fitScore: job.fitScore,
            fitReasons: job.fitReasons,
            missingRequirements: job.missingRequirements,
            riskFlags: job.riskFlags,
            applicationStrategy: job.applicationStrategy,
            status: job.status,
          },
          $setOnInsert: { dedupeKey: job.dedupeKey },
        },
        { upsert: true, new: true },
      ),
    ),
  );

  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: args.sessionId,
    type: "jobs_ranked",
    message: `Ranked ${docs.length} job candidates.`,
    payload: { count: docs.length },
  });

  return docs;
}

export async function createOrUpdateDraft(args: {
  userId: string;
  jobCandidateId: string;
  coverLetterText?: string;
}) {
  await connectToDatabase();
  const job = await AutoApplyJobCandidateModel.findOne({
    _id: args.jobCandidateId,
    userId: args.userId,
  });
  if (!job) throw new Error("Job candidate not found.");

  const session = await AutoApplySessionModel.findOne({ _id: job.sessionId, userId: args.userId });
  if (!session) throw new Error("Session not found.");
  if (!session.uploadedResumeId) throw new Error("Resume is required before application preparation.");

  const summary = `${job.title} at ${job.company}. Fit score ${job.fitScore}. ${job.applicationStrategy}`;
  const draft = await AutoApplyApplicationDraftModel.findOneAndUpdate(
    { sessionId: job.sessionId, jobCandidateId: job._id },
    {
      $set: {
        userId: args.userId,
        sessionId: job.sessionId,
        jobCandidateId: job._id,
        resumeFileId: session.uploadedResumeId,
        additionalDocumentFileIds: session.uploadedAdditionalDocumentIds,
        coverLetterText: args.coverLetterText || "",
        generatedApplicationSummary: summary,
        riskNotes: job.riskFlags,
        finalReviewStatus: "ready",
      },
    },
    { upsert: true, new: true },
  );

  await job.updateOne({ $set: { status: "ready_for_review" } });
  await AutoApplySessionModel.findByIdAndUpdate(session._id, {
    $set: { status: "ready_for_review", currentJobCandidateId: job._id },
  });
  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: session._id.toString(),
    jobCandidateId: job._id.toString(),
    applicationDraftId: draft._id.toString(),
    type: "draft_ready",
    message: `Application draft ready for ${job.title} at ${job.company}.`,
  });

  return draft;
}

export async function saveAutoApplyMemory(args: {
  userId: string;
  sessionId: string;
  questionPattern: string;
  answer: string;
  scope: "session" | "reusable_profile";
  source: "user" | "resume" | "selected_project" | "generated_with_user_approval";
  provenance: string[];
  confidence: number;
  explicitReusableConsent: boolean;
}) {
  if (args.scope === "reusable_profile" && !args.explicitReusableConsent) {
    throw new Error("Reusable profile memory requires explicit consent.");
  }

  const memory = await AutoApplyMemoryModel.create({
    userId: args.userId,
    sessionId: args.sessionId,
    questionPattern: args.questionPattern,
    answer: args.answer,
    scope: args.scope,
    source: args.source,
    provenance: args.provenance,
    confidence: args.confidence,
    consentedAt: args.scope === "reusable_profile" ? new Date() : null,
  });

  await logAutoApplyEvent({
    userId: args.userId,
    sessionId: args.sessionId,
    type: "answer_saved",
    message:
      args.scope === "reusable_profile"
        ? "Saved answer to reusable profile memory with consent."
        : "Saved answer for this session.",
  });

  return memory;
}
