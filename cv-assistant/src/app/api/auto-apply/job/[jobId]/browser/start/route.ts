import { NextRequest, NextResponse } from "next/server";
import { getAutoApplySupervisorModel } from "@/lib/ai";
import { isKnownJobPlatformUrl, toResponsesImagePart } from "@/lib/auto-apply/browser";
import { startVisibleBrowserSession } from "@/lib/auto-apply/browser-session";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedJob, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUIDANCE_TIMEOUT_MS = 12000;
const PLATFORM_LOGIN_GUIDANCE =
  "This is a job-platform login. Sign in manually before the assistant continues. If you use Google sign-in, open the job platform in your normal browser because Google may block agent-controlled browsers with a browser-not-secure warning. After signing in, return here and restart the live preview so the assistant can continue from the authenticated session.";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { jobId } = await context.params;
  const job = await loadOwnedJob(auth.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job candidate not found." }, { status: 404 });

  const hasRestrictedSourceGuidance = job.riskFlags.includes("restricted_source_manual_guidance");

  const body = await req.json().catch(() => ({}));
  let screenshotBase64 = typeof body.screenshotBase64 === "string" ? body.screenshotBase64 : "";
  let startReason = "";
  let startBlockers: string[] = [];
  if (!screenshotBase64) {
    const browser = await startVisibleBrowserSession(
      `${auth.userId}:${job.sessionId.toString()}:${job._id.toString()}`,
      job.applyUrl || job.url,
      auth.userId,
    );
    screenshotBase64 = browser.screenshotBase64;
    startReason = browser.reason;
    startBlockers = browser.blockers;
    if (browser.mode !== "browser_active") {
      await logAutoApplyEvent({
        userId: auth.userId,
        sessionId: job.sessionId.toString(),
        jobCandidateId: job._id.toString(),
        type: "browser_manual_fallback",
        message: "Browser session stopped because manual intervention, a blocker, or a deployment limitation was detected.",
        payload: { reason: browser.reason, blockers: browser.blockers },
      });
      return NextResponse.json({
        mode: "manual_guided",
        reason: browser.reason,
        guidance: browser.blockers.includes("platform_login_required")
          ? PLATFORM_LOGIN_GUIDANCE
          : "Browser preview is open. The assistant can observe the page and continue after login or a user clarification.",
        blockers: browser.blockers,
        screenshotBase64: browser.screenshotBase64,
      });
    }
  }

  const employerLoginActive = startBlockers.includes("employer_login_required");
  const isJobPlatform = isKnownJobPlatformUrl(job.applyUrl || job.url);
  let guidance = employerLoginActive
    ? "Employer-site login or account creation is visible. Continue autonomously: click through the flow, create or use an account when possible, fill fields from the candidate profile, and ask the user only for secrets, CAPTCHA, MFA, or missing facts."
    : isJobPlatform
      ? PLATFORM_LOGIN_GUIDANCE
      : "Browser preview is live. Continue autonomously through the application flow and ask the user only when a required answer cannot be inferred safely.";
  if (!isJobPlatform || employerLoginActive) {
    try {
      const model = getAutoApplySupervisorModel();
      const response = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Inspect the visible job application page for ${job.title} at ${job.company}. Return safe next action guidance only as plain UI text. Do not use Markdown, bold markers, italic markers, headings, numbered lists, hyphen bullets, or raw snake_case identifiers. Prioritize autonomous browser actions. If this is an employer-site login or account creation flow, proceed with clicks, scrolling, field completion, and document upload where possible; ask the user only for secrets, CAPTCHA, MFA, or facts not available in the profile. If this is a job platform login such as LinkedIn, SEEK, Indeed, CareerOne, Adzuna, Talent.com, or a LinkedIn sign-in modal, instruct the user to sign in manually before the assistant continues. Mention that Google sign-in can fail inside the agent browser with a browser-not-secure warning and should be completed in the user's normal browser instead.`,
                },
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
        }),
        GUIDANCE_TIMEOUT_MS,
        "Guidance model timed out; continue from the live browser preview.",
      );
      guidance = response.response.text() || guidance;
    } catch (error) {
      guidance = error instanceof Error
        ? `Browser preview is live. Guidance model unavailable: ${error.message}`
        : guidance;
    }
  }

  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: job.sessionId.toString(),
    jobCandidateId: job._id.toString(),
    type: "browser_started",
    message: hasRestrictedSourceGuidance
      ? "Visible browser-assisted application flow started with restricted-source supervision."
      : "Visible browser-assisted application flow started.",
    payload: hasRestrictedSourceGuidance
      ? { riskFlags: job.riskFlags, supervision: "restricted_source_manual_guidance" }
      : {},
  });

  return NextResponse.json({
    mode: "browser_active",
    reason: startReason || (hasRestrictedSourceGuidance ? "restricted_source_supervised" : ""),
    guidance: hasRestrictedSourceGuidance
      ? `Restricted-source supervision is active. ${guidance}`
      : guidance,
    blockers: hasRestrictedSourceGuidance
      ? [...new Set(["restricted_source_manual_guidance", ...startBlockers])]
      : startBlockers,
    screenshotBase64,
  });
}
