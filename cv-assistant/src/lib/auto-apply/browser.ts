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

export function detectAutomationBlockers(text: string) {
  const lower = text.toLowerCase();
  const loginRequired =
    /\b(sign in|log in|login)\s+(to|before)\s+(apply|continue|access|view|submit)\b/.test(lower) ||
    /\b(apply|continue|access|view|submit)\s+(requires|required).{0,80}\b(sign in|log in|login)\b/.test(lower) ||
    lower.includes("login required") ||
    lower.includes("authentication required");

  return [
    lower.includes("captcha") ? "captcha" : "",
    loginRequired ? "login_required" : "",
    lower.includes("access denied") || lower.includes("blocked") ? "automation_blocked" : "",
    lower.includes("paywall") ? "paywall" : "",
  ].filter(Boolean);
}
