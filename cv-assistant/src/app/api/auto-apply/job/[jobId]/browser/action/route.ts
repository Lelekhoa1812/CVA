import { NextRequest, NextResponse } from "next/server";
import { runVisibleBrowserAction } from "@/lib/auto-apply/browser-session";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedActions = new Set(["click", "type", "select", "upload", "screenshot", "read_dom", "scroll"]);

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });

  if (process.env.AUTO_APPLY_BROWSER_ENABLED !== "true") {
    return NextResponse.json({ error: "Browser automation is disabled." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!allowedActions.has(body.type)) {
    return NextResponse.json({ error: "Unsupported browser action." }, { status: 400 });
  }

  const result = await runVisibleBrowserAction(
    `${auth.userId}:${job.sessionId.toString()}:${job._id.toString()}`,
    {
      type: body.type,
      selector: body.selector,
      value: body.value,
      filePath: body.filePath,
      direction: body.direction,
    },
  );

  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: job.sessionId.toString(),
    jobCandidateId: job._id.toString(),
    type: result.mode === "browser_active" ? "browser_action" : "browser_manual_fallback",
    message:
      result.mode === "browser_active"
        ? `Browser action completed: ${body.type}.`
        : "Browser automation stopped and returned to manual guidance.",
    payload: {
      action: body.type,
      selector: body.selector || "",
      blockers: result.blockers,
    },
  });

  return NextResponse.json(result);
}
