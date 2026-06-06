import { NextRequest, NextResponse } from "next/server";
import { getAutoApplySupervisorModel, resolveAutoApplySupervisorModelName } from "@/lib/ai";
import { toResponsesImagePart } from "@/lib/auto-apply/browser";
import { isVisibleBrowserEnabled, startVisibleBrowserSession } from "@/lib/auto-apply/browser-session";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });

  if (job.riskFlags.includes("restricted_source_manual_guidance")) {
    await logAutoApplyEvent({
      userId: auth.userId,
      sessionId: job.sessionId.toString(),
      jobCandidateId: job._id.toString(),
      type: "browser_manual_fallback",
      message: "Source restrictions detected. Manual guided apply is recommended.",
    });
    return NextResponse.json({ mode: "manual_guided", reason: "restricted_source" });
  }

  if (!isVisibleBrowserEnabled()) {
    await logAutoApplyEvent({
      userId: auth.userId,
      sessionId: job.sessionId.toString(),
      jobCandidateId: job._id.toString(),
      type: "browser_manual_fallback",
      message: "Browser automation is disabled; showing manual guided apply mode.",
      payload: { supervisorModel: resolveAutoApplySupervisorModelName() },
    });
    return NextResponse.json({ mode: "manual_guided", reason: "browser_disabled" });
  }

  const body = await req.json().catch(() => ({}));
  let screenshotBase64 = typeof body.screenshotBase64 === "string" ? body.screenshotBase64 : "";
  if (!screenshotBase64) {
    const browser = await startVisibleBrowserSession(
      `${auth.userId}:${job.sessionId.toString()}:${job._id.toString()}`,
      job.applyUrl || job.url,
      auth.userId,
    );
    screenshotBase64 = browser.screenshotBase64;
    if (browser.mode !== "browser_active") {
      await logAutoApplyEvent({
        userId: auth.userId,
        sessionId: job.sessionId.toString(),
        jobCandidateId: job._id.toString(),
        type: "browser_manual_fallback",
        message: "Browser session stopped because manual intervention or a blocker was detected.",
        payload: { reason: browser.reason, blockers: browser.blockers },
      });
      return NextResponse.json({
        mode: "manual_guided",
        reason: browser.reason,
        blockers: browser.blockers,
        screenshotBase64: browser.screenshotBase64,
      });
    }
  }

  let guidance = "Browser preview is live. Inspect the screenshot, then use selectors or manual source-site controls to continue.";
  try {
    const model = getAutoApplySupervisorModel();
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: `Inspect the visible job application page for ${job.title} at ${job.company}. Return safe next action guidance only.` },
          ],
        },
      ],
      tools: [{ type: "computer" }],
      extraInputItems: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Current browser screenshot." },
            toResponsesImagePart({ base64: screenshotBase64, detail: "original" }),
          ],
        },
      ],
      reasoning: { summary: "concise" },
    });
    guidance = response.response.text() || guidance;
  } catch (error) {
    guidance = error instanceof Error
      ? `Browser preview is live. Guidance model unavailable: ${error.message}`
      : guidance;
  }

  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: job.sessionId.toString(),
    jobCandidateId: job._id.toString(),
    type: "browser_started",
    message: "Visible browser-assisted application flow started.",
  });

  return NextResponse.json({ mode: "browser_active", guidance, screenshotBase64 });
}
