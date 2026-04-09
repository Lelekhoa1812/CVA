import crypto from "node:crypto";
import type {
  JobSearchResult,
  SearchFilters,
  SearchQueryMatch,
  SearchSource,
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

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
};

const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "role", "job"]);

const SOURCE_DOMAINS: Record<SearchSource, string[]> = {
  linkedin: ["linkedin.com"],
  seek: ["seek.com.au"],
  indeed: ["indeed.com"],
};

export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
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
    normalizeIdentity(result.title),
    normalizeIdentity(result.company),
    normalizeIdentity(result.location),
  ].join("::");
}

export function buildResultId(dedupeKey: string): string {
  return crypto.createHash("sha1").update(dedupeKey).digest("hex").slice(0, 16);
}

export function computeSearchQueryMatch(
  jobTitle: string,
  searchableParts: string[],
): SearchQueryMatch {
  const tokens = cleanText(jobTitle)
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) || [];

  const haystack = searchableParts.map((part) => cleanText(part).toLowerCase()).join(" ");
  if (tokens.length > 0 && tokens.every((token) => haystack.includes(token))) {
    return "strong";
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

function wordToNumber(value: string): number | null {
  const parts = value.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 1) return WORD_NUMBERS[parts[0]] ?? null;
  if (parts.length === 2 && WORD_NUMBERS[parts[0]] && WORD_NUMBERS[parts[1]]) {
    return WORD_NUMBERS[parts[0]] + WORD_NUMBERS[parts[1]];
  }
  return null;
}

export function parsePostedAgeDays(postedText: string): number | null {
  const text = cleanText(postedText).toLowerCase();
  if (!text) return null;

  if (["today", "just posted", "new", "hour ago", "hours ago", "h ago"].some((token) => text.includes(token))) {
    return 0;
  }
  if (text.includes("yesterday")) return 1;

  const numericMatch = text.match(/(\d+)\s*(minute|hour|day|week|month|year|m|h|d|w|mo)s?/);
  if (numericMatch) {
    const value = Number(numericMatch[1]);
    const unit = numericMatch[2];
    if (["minute", "hour", "m", "h"].includes(unit)) return 0;
    if (["day", "d"].includes(unit)) return value;
    if (["week", "w"].includes(unit)) return value * 7;
    if (["month", "mo"].includes(unit)) return value * 30;
    if (unit === "year") return value * 365;
  }

  const wordMatch = text.match(/listed\s+([a-z-]+)\s+days?\s+ago/);
  if (wordMatch) {
    return wordToNumber(wordMatch[1]);
  }

  return null;
}

function inferWorkplaceMode(value: string): SearchFilters["workplaceMode"] {
  const text = cleanText(value).toLowerCase();
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("remote") || text.includes("work from home") || text.includes("wfh")) return "remote";
  if (text.includes("onsite") || text.includes("on-site") || text.includes("in office")) return "onsite";
  return "any";
}

function inferEmploymentType(value: string): SearchFilters["employmentType"] {
  const text = cleanText(value).toLowerCase();
  if (text.includes("full time") || text.includes("full-time")) return "full-time";
  if (text.includes("part time") || text.includes("part-time")) return "part-time";
  if (text.includes("contract") || text.includes("contract/temp")) return "contract";
  if (text.includes("intern")) return "internship";
  return "any";
}

export function passesPostFilters(result: JobSearchResult, filters: SearchFilters): boolean {
  if (filters.postedWithin !== "any") {
    const maxDays = {
      "24h": 1,
      "3d": 3,
      "7d": 7,
      "14d": 14,
      "30d": 30,
    }[filters.postedWithin];
    const ageDays = parsePostedAgeDays(result.postedText);
    if (ageDays === null || ageDays > maxDays) {
      return false;
    }
  }

  const searchable = [result.title, result.company, result.location, result.snippet].join(" ");
  if (filters.workplaceMode !== "any" && inferWorkplaceMode(searchable) !== filters.workplaceMode) {
    return false;
  }
  if (filters.employmentType !== "any" && inferEmploymentType(searchable) !== filters.employmentType) {
    return false;
  }
  return true;
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
  return { blocked: false };
}
