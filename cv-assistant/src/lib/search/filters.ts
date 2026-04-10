import type { JobSearchResult, SearchFilters } from "@/lib/search/types";

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

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function wordToNumber(value: string): number | null {
  const parts = value.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 1) return WORD_NUMBERS[parts[0]] ?? null;
  if (parts.length === 2 && WORD_NUMBERS[parts[0]] && WORD_NUMBERS[parts[1]]) {
    return WORD_NUMBERS[parts[0]] + WORD_NUMBERS[parts[1]];
  }
  return null;
}

function parsePostedAgeDays(postedText: string): number | null {
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

// Root Cause vs Logic:
// Root Cause: The client search page was importing `passesPostFilters` from the server utils module, which pulls in
// `node:crypto` and breaks the client bundle.
// Logic: Move the filter helpers into a runtime-safe module so the client can import them without dragging the crypto
// dependency into its bundle.
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

