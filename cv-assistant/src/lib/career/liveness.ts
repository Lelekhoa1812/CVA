import { cleanText } from "./utils";

const EXPIRED_PATTERNS = [
  "job no longer available",
  "no longer open",
  "position has been filled",
  "this job has expired",
  "page not found",
  "job no longer exists",
  "job is closed",
];

type LivenessInput = {
  bodyText: string;
  finalUrl: string;
  statusCode?: number;
};

export function classifyLeadLiveness(input: LivenessInput) {
  const bodyText = cleanText(input.bodyText).toLowerCase();
  const finalUrl = cleanText(input.finalUrl).toLowerCase();
  const statusCode = input.statusCode || 0;

  if (statusCode === 404 || statusCode === 410) {
    return { liveStatus: "expired" as const, reason: `The listing returned HTTP ${statusCode}.` };
  }

  if (finalUrl.includes("error=true")) {
    return { liveStatus: "expired" as const, reason: "The job board redirected to a closed-listing URL." };
  }

  if (EXPIRED_PATTERNS.some((pattern) => bodyText.includes(pattern))) {
    return { liveStatus: "expired" as const, reason: "The page body matches a closed-job pattern." };
  }

  if (bodyText.length < 220) {
    return { liveStatus: "uncertain" as const, reason: "The detail page had too little readable content." };
  }

  if (/\bapply\b|\bsubmit application\b|\bstart your application\b/.test(bodyText)) {
    return { liveStatus: "active" as const, reason: "The page still exposes an application control." };
  }

  return { liveStatus: "uncertain" as const, reason: "The page loaded, but application signals were inconclusive." };
}
