const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "your",
  "their",
  "role",
  "jobs",
  "job",
  "have",
  "has",
  "will",
  "our",
  "you",
  "are",
  "but",
  "all",
  "can",
  "not",
  "who",
  "its",
  "about",
]);

export function cleanText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

export function splitList(value: string | null | undefined) {
  return cleanText(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function tokenize(value: string) {
  return cleanText(value)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.+/#-]*/g)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) || [];
}

export function topKeywords(text: string, limit = 12) {
  const counts = new Map<string, number>();

  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

export function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const matches = a.filter((token) => bSet.has(token)).length;
  return matches / Math.max(a.length, b.length);
}

export function buildPeriod(timeFrom?: string, timeTo?: string) {
  const from = cleanText(timeFrom);
  const to = cleanText(timeTo);
  if (from && to) return `${from} - ${to}`;
  return from || to || "";
}

export function slugify(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function percentage(value: number, max = 1) {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.round(clamp(value / max, 0, 1) * 100);
}

export function parseSalaryRange(text: string) {
  const normalized = cleanText(text);
  if (!normalized) {
    return { minimum: 0, maximum: 0, currency: "" };
  }

  const matches = [...normalized.matchAll(/(?:\$|USD|AUD|EUR|GBP)?\s*([0-9]{2,3})(?:[,.]([0-9]{3}))?\s*[kK]?/g)];
  const values = matches
    .map((match) => {
      const major = Number.parseInt(match[1], 10);
      const minor = match[2] ? Number.parseInt(match[2], 10) : 0;
      if (!Number.isFinite(major)) return 0;
      if (match[0].toLowerCase().includes("k")) {
        return major * 1000;
      }
      return minor ? Number(`${major}${match[2]}`) : major;
    })
    .filter((value) => value >= 1_000);

  const currencyMatch = normalized.match(/\b(AUD|USD|EUR|GBP)\b/i) || normalized.match(/\$/);
  return {
    minimum: values.length ? Math.min(...values) : 0,
    maximum: values.length ? Math.max(...values) : 0,
    currency: currencyMatch ? currencyMatch[0].replace("$", "USD").toUpperCase() : "",
  };
}

export function inferRemotePolicy(text: string, location: string) {
  const haystack = `${cleanText(text)} ${cleanText(location)}`.toLowerCase();
  if (!haystack) return "";
  if (/\bremote\b/.test(haystack) && /\b(global|anywhere|worldwide)\b/.test(haystack)) return "global remote";
  if (/\bremote\b/.test(haystack)) return "remote";
  if (/\bhybrid\b/.test(haystack)) return "hybrid";
  if (/\bon-?site\b|\bin office\b/.test(haystack)) return "onsite";
  return "";
}

export function inferEmploymentType(text: string) {
  const haystack = cleanText(text).toLowerCase();
  if (haystack.includes("full-time") || haystack.includes("full time")) return "full-time";
  if (haystack.includes("part-time") || haystack.includes("part time")) return "part-time";
  if (haystack.includes("contract")) return "contract";
  if (haystack.includes("intern")) return "internship";
  return "";
}

export function firstSentence(value: string) {
  const normalized = cleanText(value);
  if (!normalized) return "";
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  return cleanText(match?.[0] || normalized);
}

export function coverageFromMatches(matchCount: number) {
  if (matchCount >= 2) return "covered" as const;
  if (matchCount === 1) return "partial" as const;
  return "gap" as const;
}
