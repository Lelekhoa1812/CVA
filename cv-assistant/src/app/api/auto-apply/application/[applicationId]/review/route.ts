import { NextRequest, NextResponse } from "next/server";
import { isAuthPayload, loadOwnedDraft, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyUploadedFileModel } from "@/lib/models/AutoApplyUploadedFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ applicationId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { applicationId } = await context.params;
  const draft = await loadOwnedDraft(auth.userId, applicationId);
  if (!draft) return NextResponse.json({ error: "Application draft not found." }, { status: 404 });

  const [job, resume, additionalDocuments] = await Promise.all([
    AutoApplyJobCandidateModel.findOne({ _id: draft.jobCandidateId, userId: auth.userId }).lean(),
    draft.resumeFileId
      ? AutoApplyUploadedFileModel.findOne({ _id: draft.resumeFileId, userId: auth.userId }).select("-data").lean()
      : null,
    AutoApplyUploadedFileModel.find({ _id: { $in: draft.additionalDocumentFileIds }, userId: auth.userId })
      .select("-data")
      .lean(),
  ]);

  return NextResponse.json({
    review: {
      company: job?.company || "",
      roleTitle: job?.title || "",
      source: job?.source || "",
      resume,
      coverLetterText: draft.coverLetterText,
      additionalDocuments,
      employerQuestions: draft.employerQuestions,
      answers: draft.answers,
      generatedApplicationSummary: draft.generatedApplicationSummary,
      riskNotes: draft.riskNotes,
      finalReviewStatus: draft.finalReviewStatus,
    },
  });
}
