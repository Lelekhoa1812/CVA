import { NextRequest, NextResponse } from "next/server";
import { buildAutofillPack, packToText } from "@/lib/auto-apply/pack";
import type { DraftAnswer } from "@/lib/auto-apply/questions";
import { isAuthPayload, loadOwnedDraftByJob, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { normalizeStage } from "@/lib/auto-apply/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const stage = normalizeStage(job.status);
  if (stage !== "approved" && stage !== "applied") {
    return NextResponse.json({ error: "Approve this application before opening it." }, { status: 409 });
  }
  const draft = await loadOwnedDraftByJob(auth.userId, jobId);
  if (!draft) return NextResponse.json({ error: "No prepared application." }, { status: 404 });
  const pack = buildAutofillPack({
    title: job.title,
    company: job.company,
    applyUrl: draft.applyUrl || job.applyUrl,
    provider: job.ats?.provider || "",
    answers: (draft.answers || []) as unknown as DraftAnswer[],
    coverLetter: draft.coverLetterText,
  });
  return NextResponse.json({ pack, text: packToText(pack), applyUrl: pack.job.applyUrl });
}
