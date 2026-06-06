export function imageBufferToDataUrl(buffer: Buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function toResponsesImagePart(args: {
  base64: string;
  mimeType?: string;
  detail?: "low" | "high" | "auto" | "original";
}) {
  return {
    type: "input_image" as const,
    image_url: `data:${args.mimeType || "image/png"};base64,${args.base64}`,
    detail: args.detail || "auto",
  };
}

export function toComputerScreenshotOutput(args: {
  callId: string;
  base64: string;
  mimeType?: string;
  detail?: "low" | "high" | "auto" | "original";
}) {
  return {
    call_id: args.callId,
    type: "computer_call_output" as const,
    output: {
      type: "computer_screenshot" as const,
      image_url: `data:${args.mimeType || "image/png"};base64,${args.base64}`,
      detail: args.detail || "original",
    },
  };
}

const JOB_PLATFORM_HOST_PATTERNS = [
  "linkedin.",
  "seek.",
  "indeed.",
  "careerone.",
  "adzuna.",
  "talent.com",
];

export function isKnownJobPlatformUrl(url?: string) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return JOB_PLATFORM_HOST_PATTERNS.some((pattern) => hostname.includes(pattern));
  } catch {
    return false;
  }
}

export function detectAutomationBlockers(text: string, url?: string) {
  const lower = text.toLowerCase();
  const loginRequired =
    /\b(sign in|log in|login)\s+(to|before)\s+(apply|continue|access|view|submit)\b/.test(lower) ||
    /\b(sign in|log in|login)\s+to\s+(see|view)\b/.test(lower) ||
    /\b(apply|continue|access|view|submit)\s+(requires|required).{0,80}\b(sign in|log in|login)\b/.test(lower) ||
    lower.includes("login required") ||
    lower.includes("authentication required") ||
    (lower.includes("new to linkedin") && lower.includes("join now"));
  const loginBlocker = loginRequired
    ? isKnownJobPlatformUrl(url)
      ? "platform_login_required"
      : "employer_login_required"
    : "";

  return [
    lower.includes("captcha") ? "captcha" : "",
    loginBlocker,
    lower.includes("access denied") || lower.includes("blocked") ? "automation_blocked" : "",
    lower.includes("paywall") ? "paywall" : "",
  ].filter(Boolean);
}
