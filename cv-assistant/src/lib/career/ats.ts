import type { AtsValidationReport, ResumeDraft } from "./types";
import { cleanText, percentage, tokenize } from "./utils";

const REQUIRED_SECTIONS = ["summary", "competencies", "experiences", "projects", "education", "skills"] as const;

export function validateResumeDraft(
  draft: ResumeDraft,
  options: { keywords: string[]; pageBudget?: number },
): AtsValidationReport {
  const warnings: string[] = [];
  const body = cleanText(JSON.stringify(draft));
  const draftTokens = new Set(tokenize(body));
  const keywords = [...new Set(options.keywords.map((keyword) => cleanText(keyword).toLowerCase()).filter(Boolean))];
  const coveredKeywords = keywords.filter((keyword) => draftTokens.has(keyword.toLowerCase()));
  const unsupportedClaims = /placeholder|tbd|lorem ipsum|<metric>/i.test(body) ? 1 : 0;

  for (const section of REQUIRED_SECTIONS) {
    const value = draft[section];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !cleanText(value)) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      warnings.push(`The ${section} section is empty, which weakens ATS completeness.`);
    }
  }

  const keywordCoverage = keywords.length ? percentage(coveredKeywords.length, keywords.length) : 100;
  if (keywordCoverage < 55) {
    warnings.push("Keyword coverage is below the recommended ATS floor.");
  }

  const roughPageEstimate = Math.ceil(body.length / 3200) || 1;
  if ((options.pageBudget || 2) < roughPageEstimate) {
    warnings.push("The draft likely exceeds the intended page budget.");
  }

  if (unsupportedClaims > 0) {
    warnings.push("The draft still contains placeholder or unsupported claim markers.");
  }

  return {
    supportedClaims: Math.max(0, coveredKeywords.length),
    unsupportedClaims,
    keywordCoverage,
    missingKeywords: keywords.filter((keyword) => !draftTokens.has(keyword.toLowerCase())),
    warnings,
    passed: keywordCoverage >= 55 && unsupportedClaims === 0,
  };
}
