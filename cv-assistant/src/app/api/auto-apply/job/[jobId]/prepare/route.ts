import { NextRequest, NextResponse } from "next/server";
import { prepareJobById } from "@/lib/auto-apply/engine";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (job.status === "applied" || job.status === "approved") {
    return NextResponse.json({ error: "This application is already approved. Unapprove it before re-preparing." }, { status: 409 });
  }
  const outcome = await prepareJobById({ jobId, userId: auth.userId });
  if (outcome === "busy") return NextResponse.json({ error: "This application is already being prepared." }, { status: 409 });
  if (outcome === "failed") return NextResponse.json({ error: "Preparation failed. Try again in a moment.", outcome }, { status: 502 });
  return NextResponse.json({ outcome });
}
