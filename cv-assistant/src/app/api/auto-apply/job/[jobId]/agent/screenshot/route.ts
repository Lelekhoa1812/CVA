import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { agentWorkDir } from "@/lib/auto-apply/agent-run";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the agent saw the last time it worked on this application, for its owner only. */
export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  const file = job?.agent?.screenshot || "";
  // Only a file inside this application's own work folder is ever served.
  const dir = agentWorkDir(jobId);
  if (!file || path.dirname(path.resolve(file)) !== path.resolve(dir)) return NextResponse.json({ error: "No screenshot." }, { status: 404 });
  try {
    return new NextResponse(new Uint8Array(await fs.readFile(file)), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The screenshot is no longer on disk." }, { status: 404 });
  }
}
