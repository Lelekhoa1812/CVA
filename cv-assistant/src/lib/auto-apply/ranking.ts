import type { JobSearchResult, SearchSource } from "../search/types";
import { flattenGroundTruthText } from "./ground-truth";

export type RankableJob = {
  id?: string;
  source: SearchSource | string;
  title: string;
  company: string;
  location: string;
  snippet?: string;
  descriptionText?: string;
  listingUrl?: string;
  applicationUrl?: string;
  applicationUrlType?: string;
  dedupeKey?: string;
};

export type RankedJob = RankableJob & {
  dedupeKey: string;
  fitScore: number;
  fitReasons: string[];
  missingRequirements: string[];
  riskFlags: string[];
  applicationStrategy: string;
  status: "shortlisted" | "discovered" | "skipped" | "manual_apply_recommended";
};

const restrictedSources = new Set(["linkedin", "indeed"]);
const PLACEHOLDER_COMPANIES = new Set(["tbh", "unknown"]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesNormalized(haystack: string, needle: string) {
  return Boolean(needle) && haystack.includes(needle);
}

function isPlaceholderCompany(company: string) {
  return PLACEHOLDER_COMPANIES.has(normalize(company));
}

export function createAutoApplyExactDuplicateKey(job: Pick<RankableJob, "title" | "company">) {
  const company = normalize(job.company);
  if (!company || isPlaceholderCompany(company)) return "";
  const title = normalize(job.title);
  if (!title) return "";
  return `${title}::${company}`;
}

export function createAutoApplyDedupeKey(job: RankableJob) {
  if (job.dedupeKey?.trim()) return job.dedupeKey.trim();
  return normalize([job.source, job.company, job.title, job.location, job.listingUrl || job.applicationUrl].join("::"));
}

function tokenize(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["and", "the", "for", "with", "role", "job"].includes(token));
}

export function dedupeJobs<T extends RankableJob>(jobs: T[]) {
  const seen = new Set<string>();
  const seenExactDuplicates = new Set<string>();
  return jobs.filter((job) => {
    const exactDuplicateKey = createAutoApplyExactDuplicateKey(job);
    if (exactDuplicateKey) {
      if (seenExactDuplicates.has(exactDuplicateKey)) return false;
      seenExactDuplicates.add(exactDuplicateKey);
    }

    const key = createAutoApplyDedupeKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rankAutoApplyCandidates(args: {
  jobs: RankableJob[];
  prompt: string;
  groundTruthSnapshot: { items?: Array<{ title?: string; summary?: string; evidence?: string[] }> };
  mustHaveKeywords?: string[];
  excludeKeywords?: string[];
  companyBlacklist?: string[];
}) {
  const promptTokens = new Set(tokenize(args.prompt));
  const groundTruthText = flattenGroundTruthText(args.groundTruthSnapshot);
  const groundTruthTokens = new Set(tokenize(groundTruthText));
  const mustHave = (args.mustHaveKeywords || []).map(normalize).filter(Boolean);
  const exclude = (args.excludeKeywords || []).map(normalize).filter(Boolean);
  const blacklist = (args.companyBlacklist || []).map(normalize).filter(Boolean);

  return dedupeJobs(args.jobs)
    .map((job): RankedJob => {
      const haystack = normalize(
        [job.title, job.company, job.location, job.snippet, job.descriptionText].filter(Boolean).join(" "),
      );
      const titleTokens = tokenize(job.title);
      const promptMatches = [...promptTokens].filter((token) => includesNormalized(haystack, token));
      const evidenceMatches = [...groundTruthTokens].filter((token) => includesNormalized(haystack, token));
      const titlePromptMatches = titleTokens.filter((token) => promptTokens.has(token));
      const missingMustHave = mustHave.filter((keyword) => !includesNormalized(haystack, keyword));
      const matchedMustHave = mustHave.filter((keyword) => includesNormalized(haystack, keyword));
      const excludedMatches = exclude.filter((keyword) => includesNormalized(haystack, keyword));
      const blacklisted = blacklist.some((company) => normalize(job.company).includes(company));
      const riskFlags = [
        ...(restrictedSources.has(String(job.source)) ? ["restricted_source_manual_guidance"] : []),
        ...(excludedMatches.length ? [`excluded_keywords:${excludedMatches.join(",")}`] : []),
        ...(blacklisted ? ["blacklisted_company"] : []),
      ];

      let fitScore = 35;
      fitScore += Math.min(20, promptMatches.length * 5);
      fitScore += Math.min(20, evidenceMatches.length * 3);
      fitScore += Math.min(15, titlePromptMatches.length * 6);
      fitScore += Math.min(16, matchedMustHave.length * 8);
      fitScore -= missingMustHave.length * 7;
      fitScore -= excludedMatches.length * 15;
      if (blacklisted) fitScore -= 40;
      fitScore = Math.max(0, Math.min(100, Math.round(fitScore)));

      const status =
        blacklisted || excludedMatches.length
          ? "skipped"
          : restrictedSources.has(String(job.source))
            ? "manual_apply_recommended"
            : fitScore >= 70
              ? "shortlisted"
              : "discovered";

      return {
        ...job,
        dedupeKey: createAutoApplyDedupeKey(job),
        fitScore,
        fitReasons: [
          promptMatches.length ? `Matches ${promptMatches.slice(0, 6).join(", ")} from the search prompt.` : "",
          matchedMustHave.length ? `Covers must-have signals like ${matchedMustHave.slice(0, 4).join(", ")}.` : "",
          evidenceMatches.length
            ? `Supported by selected evidence mentioning ${evidenceMatches.slice(0, 6).join(", ")}.`
            : "",
          status === "manual_apply_recommended"
            ? "Source may restrict direct automation, so manual guided apply is recommended."
            : "",
        ].filter(Boolean),
        missingRequirements: missingMustHave,
        riskFlags,
        applicationStrategy:
          status === "manual_apply_recommended"
            ? "Prepare documents and guide the user through the source manually."
            : fitScore >= 70
              ? "Prepare a tailored application for user review."
              : "Keep as a lower-priority lead unless the user selects it.",
        status,
      };
    })
    .sort((left, right) => right.fitScore - left.fitScore);
}

export function fromSearchResult(result: JobSearchResult): RankableJob {
  return {
    id: result.id,
    source: result.source,
    title: result.title,
    company: result.company,
    location: result.location,
    snippet: result.snippet,
    descriptionText: result.snippet,
    listingUrl: result.listingUrl,
    applicationUrl: result.applicationUrl,
    applicationUrlType: result.applicationUrlType,
    dedupeKey: result.dedupeKey,
  };
}
