import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAgentEnabled } from "@/lib/auto-apply/agent";
import { agentApplyJob } from "@/lib/auto-apply/agent-run";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ mode: z.enum(["check", "submit"]).default("check"), force: z.boolean().optional() });

/** Runs the local apply agent on one approved application and waits for it. Submitting needs the session's apply mode to allow it. */
export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  if (!isAgentEnabled()) return NextResponse.json({ error: "The local apply agent is not enabled on this server." }, { status: 404 });
  const { jobId } = await context.params;
  if (!(await loadOwnedJob(auth.userId, jobId))) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid agent request." }, { status: 400 });
  const outcome = await agentApplyJob({ jobId, userId: auth.userId, mode: parsed.data.mode, force: parsed.data.force, signal: req.signal });
  return NextResponse.json({ outcome });
}
