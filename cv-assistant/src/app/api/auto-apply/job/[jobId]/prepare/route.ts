import { NextRequest, NextResponse } from "next/server";
import { createOrUpdateDraft } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { getModel } from "@/lib/ai";
import { buildCoverLetterPrompt, getCoverLetterContactDetails } from "@/lib/cover-letter";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { UserModel, type Profile } from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rankSelectedItemsForJob(
  items: Array<{ title: string; summary: string; kind: string }>,
  jobText: string,
) {
  const tokens = new Set(
    jobText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );

  return [...items]
    .map((item, index) => {
      const haystack = [item.title, item.summary].join(" ").toLowerCase();
      const overlap = [...tokens].filter((token) => haystack.includes(token)).length;
      return { ...item, index, overlap };
    })
    .sort((left, right) => right.overlap - left.overlap);
}

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });

  const session = await AutoApplySessionModel.findOne({ _id: job.sessionId, userId: auth.userId });
  if (!session?.uploadedResumeId) {
    return NextResponse.json({ error: "Resume is required before application preparation." }, { status: 400 });
  }

  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as Profile | undefined;
  const contact = getCoverLetterContactDetails(profile);
  const selectedItems = rankSelectedItemsForJob(
    ((session.sessionGroundTruthSnapshot as { items?: Array<{ title: string; summary: string; kind: string }> })?.items || []).map((item) => ({
      title: item.title,
      summary: item.summary,
      kind: item.kind,
    })),
    `${job.title} ${job.company} ${job.descriptionText || job.title}`,
  )
    .slice(0, 6)
    .map((item, index) => ({
      index,
      type: item.kind === "project" ? ("project" as const) : ("experience" as const),
      title: item.title,
      summary: item.summary,
      description: item.summary,
    }));

  const prompt = buildCoverLetterPrompt({
    candidateName: profile?.name,
    company: job.company,
    jobDescription: job.descriptionText || job.title,
    contactLines: contact.promptLines,
    prioritizedItems: selectedItems,
  });

  let coverLetterText = "";
  try {
    const result = await getModel("hard").generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    coverLetterText = result.response.text().trim();
  } catch {
    coverLetterText = "";
  }

  const draft = await createOrUpdateDraft({ userId: auth.userId, jobCandidateId: jobId, coverLetterText });
  return NextResponse.json({ draft });
}
