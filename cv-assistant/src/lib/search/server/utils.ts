import crypto from "node:crypto";
import {
  SEARCH_SOURCES,
  type JobSearchResult,
  type SearchInstructionExpansion,
  type SearchInstructionContext,
  type SearchQueryMatch,
  type SearchRequest,
  type SearchSource,
} from "@/lib/search/types";

const TRACKING_QUERY_KEYS = new Set([
  "refid",
  "trackingid",
  "trk",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "role", "job"]);
const KEYWORD_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "looking",
  "roles",
  "prefer",
  "preferred",
  "only",
  "search",
  "instruction",
  "team",
  "teams",
  "company",
  "companies",
]);

const SOURCE_DOMAINS: Record<SearchSource, string[]> = {
  linkedin: ["linkedin.com"],
  seek: ["seek.com.au"],
  indeed: ["indeed.com"],
  careerone: ["careerone.com.au"],
  adzuna: ["adzuna.com.au"],
  talent: ["talent.com"],
};

export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

export function stripHtmlTags(value: string | null | undefined): string {
  if (!value) return "";
  return cleanText(value.replace(/<[^>]+>/g, " "));
}

export function truncateText(value: string, limit = 240): string {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}...`;
}

export function canonicalizeUrl(url: string): string {
  if (!url) return "";

  const parsed = new URL(url);
  const nextParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowered = key.toLowerCase();
    if (TRACKING_QUERY_KEYS.has(lowered) || lowered.startsWith("utm_")) {
      continue;
    }
    nextParams.append(key, value);
  }

  parsed.hash = "";
  parsed.search = nextParams.toString();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

export function absoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(cleanText(href), baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeIdentity(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildDuplicateGroupKey(result: Pick<JobSearchResult, "title" | "company" | "location">): string {
  return [
    normalizeIdentity(result.title),
    normalizeIdentity(result.company),
    normalizeIdentity(result.location),
  ].join("::");
}

export function buildDedupeKey(result: JobSearchResult): string {
  const canonicalApplication = canonicalizeUrl(result.applicationUrl);
  if (canonicalApplication && !canonicalApplication.includes("/jobs?")) {
    return canonicalApplication;
  }

  const canonicalListing = canonicalizeUrl(result.listingUrl);
  if (canonicalListing && !canonicalListing.includes("/jobs?")) {
    return canonicalListing;
  }

  return [
    result.source,
    buildDuplicateGroupKey(result),
  ].join("::");
}

export function buildResultId(dedupeKey: string): string {
  return crypto.createHash("sha1").update(dedupeKey).digest("hex").slice(0, 16);
}

function extractKeywordTokens(value: string): string[] {
  return cleanText(value)
    .toLowerCase()
    .match(/[a-z0-9+#.]+/g)
    ?.filter((token) => token.length > 2 && !KEYWORD_STOP_WORDS.has(token)) || [];
}

export function deriveSearchTermsFromRequest(request: SearchRequest): string[] {
  const expansion = request.instructionExpansion;
  return Array.from(
    new Set([
      ...extractKeywordTokens(request.jobTitle),
      ...extractKeywordTokens(expansion?.suggestedJobTitle || ""),
      ...(expansion?.preferredKeywords || []).flatMap((keyword) => extractKeywordTokens(keyword)),
      ...(expansion?.optionalKeywords || []).flatMap((keyword) => extractKeywordTokens(keyword)),
    ]),
  );
}

export function computeSearchQueryMatch(
  jobTitle: string,
  searchableParts: string[],
  request?: SearchRequest,
): SearchQueryMatch {
  const directTitleTokens = cleanText(jobTitle)
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) || [];
  const rankingTokens = request ? deriveSearchTermsFromRequest(request) : directTitleTokens;

  const haystack = searchableParts.map((part) => cleanText(part).toLowerCase()).join(" ");
  if (directTitleTokens.length > 0 && directTitleTokens.every((token) => haystack.includes(token))) {
    return "strong";
  }

  const preferredMatches = request?.instructionExpansion?.preferredKeywords.filter((keyword) =>
    cleanText(keyword)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token)),
  ).length || 0;

  const optionalMatches = request?.instructionExpansion?.optionalKeywords.filter((keyword) =>
    cleanText(keyword)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token)),
  ).length || 0;

  if (rankingTokens.length > 0) {
    const ratio = rankingTokens.filter((token) => haystack.includes(token)).length / rankingTokens.length;
    if (ratio >= 0.6 || preferredMatches > 0 || optionalMatches >= 2) {
      return "strong";
    }
  }

  return "partial";
}

export function isSourceUrl(source: SearchSource, url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SOURCE_DOMAINS[source].some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}

export function chooseApplicationUrl(
  source: SearchSource,
  externalUrl: string | null | undefined,
  detailUrl: string,
  fallbackUrl?: string,
): { applicationUrl: string; applicationUrlType: JobSearchResult["applicationUrlType"] } {
  if (externalUrl) {
    const canonicalExternal = canonicalizeUrl(externalUrl);
    if (canonicalExternal && !isSourceUrl(source, canonicalExternal)) {
      return { applicationUrl: canonicalExternal, applicationUrlType: "external" };
    }
    if (canonicalExternal) {
      return { applicationUrl: canonicalExternal, applicationUrlType: "board-detail" };
    }
  }

  const canonicalDetail = canonicalizeUrl(detailUrl);
  if (canonicalDetail) {
    return { applicationUrl: canonicalDetail, applicationUrlType: "board-detail" };
  }

  return {
    applicationUrl: canonicalizeUrl(fallbackUrl || detailUrl),
    applicationUrlType: "listing",
  };
}

export function extractApplyLink(
  source: SearchSource,
  anchors: Array<{ label: string; href: string }>,
  fallbackUrl: string,
): { applicationUrl: string; applicationUrlType: JobSearchResult["applicationUrlType"] } {
  for (const anchor of anchors) {
    const lowered = cleanText(anchor.label).toLowerCase();
    if (!lowered.includes("apply")) continue;
    const absolute = canonicalizeUrl(absoluteUrl(anchor.href, fallbackUrl));
    if (absolute && !isSourceUrl(source, absolute)) {
      return { applicationUrl: absolute, applicationUrlType: "external" };
    }
  }

  return chooseApplicationUrl(source, undefined, fallbackUrl);
}

export function buildSearchInstructionContext(args: {
  request: SearchRequest;
  context?: SearchInstructionContext | null;
}): SearchInstructionContext {
  const context = args.context;
  return {
    targetRoles: context?.targetRoles || [],
    preferredLocations: context?.preferredLocations || [],
    preferredSources: context?.preferredSources || [],
    remoteOnly: context?.remoteOnly || false,
    techStackPreferences: context?.techStackPreferences || [],
    cultureSignals: context?.cultureSignals || [],
  };
}

export function mergeSearchInstructionExpansion(
  request: SearchRequest,
  expansion: SearchInstructionExpansion | null | undefined,
): SearchRequest {
  if (!expansion) {
    return {
      ...request,
      instructionExpansion: null,
    };
  }

  const selectedSources = expansion.suggestedSources?.length
    ? SEARCH_SOURCES.filter((source) =>
        request.selectedSources.includes(source) || expansion.suggestedSources?.includes(source),
      )
    : request.selectedSources;

  return {
    ...request,
    jobTitle: expansion.suggestedJobTitle || request.jobTitle,
    location: expansion.suggestedLocation || request.location,
    selectedSources,
    filters: {
      ...request.filters,
      ...expansion.suggestedFilters,
    },
    instructionExpansion: expansion,
  };
}

export function detectBlockedPage(
  source: SearchSource,
  statusCode: number,
  body: string,
): { blocked: boolean; blockedReason?: string } {
  const text = cleanText(body).toLowerCase();
  if (statusCode === 403 || statusCode === 429) {
    return { blocked: true, blockedReason: `${source.toUpperCase()} returned HTTP ${statusCode}.` };
  }
  if (source === "indeed" && text.includes("security check - indeed.com")) {
    return { blocked: true, blockedReason: "Indeed presented a security check." };
  }
  if (source === "seek" && text.includes("safe-job-searching")) {
    return { blocked: true, blockedReason: "SEEK returned a bot-protection page." };
  }
  if (source === "linkedin" && text.includes("unusual activity detected")) {
    return { blocked: true, blockedReason: "LinkedIn blocked guest access." };
  }
  if (source === "adzuna" && text.includes("access denied")) {
    return { blocked: true, blockedReason: "Adzuna denied access to this page." };
  }
  if (source === "talent" && text.includes("access denied")) {
    return { blocked: true, blockedReason: "Talent.com denied access to this page." };
  }
  return { blocked: false };
}
