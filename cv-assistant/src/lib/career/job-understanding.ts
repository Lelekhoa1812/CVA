import { z } from "zod";
import { generateJsonSafe } from "@/lib/ai";
import type { JobUnderstanding } from "@/lib/career/types";
import { cleanText, firstSentence, topKeywords, uniqueStrings } from "@/lib/career/utils";

/* Motivation vs Logic:
   Motivation: Raw word-frequency tokens from scraped HTML leak markup and junk identifiers into requirements.
   Logic: Ask the model for structured requirements and explicitly list noise to discard; validate with Zod and fall back to a filtered heuristic list only when the API is unavailable. */

const MIN_CHARS_FOR_LLM = 120;

export const jobUnderstandingSchema = z.object({
  roleSummary: z.string().default(""),
  mustHaveRequirements: z.array(z.string()).default([]),
  preferredRequirements: z.array(z.string()).default([]),
  responsibilityThemes: z.array(z.string()).default([]),
  workMode: z.string().default(""),
  seniority: z.string().default(""),
  companySignals: z.array(z.string()).default([]),
  disqualifiedNoiseTokens: z.array(z.string()).default([]),
});

export type JobUnderstandingValidated = z.infer<typeof jobUnderstandingSchema>;

function isLikelyNoiseToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (t.length < 3 || t.length > 48) return true;
  if (/^u[0-9a-f]{4}$/.test(t)) return true;
  if (/^[_\-]+$/.test(t)) return true;
  if (/featureflag|typename|__schema|jsonld/i.test(t)) return true;
  return false;
}

export function filterKeywordCandidates(tokens: string[]): string[] {
  return uniqueStrings(tokens.map((x) => cleanText(x))).filter((t) => t && !isLikelyNoiseToken(t));
}

function normalizeUnderstanding(raw: JobUnderstandingValidated): JobUnderstanding {
  return {
    roleSummary: cleanText(raw.roleSummary) || "",
    mustHaveRequirements: filterKeywordCandidates(raw.mustHaveRequirements).slice(0, 12),
    preferredRequirements: filterKeywordCandidates(raw.preferredRequirements).slice(0, 12),
    responsibilityThemes: filterKeywordCandidates(raw.responsibilityThemes).slice(0, 8),
    workMode: cleanText(raw.workMode) || "",
    seniority: cleanText(raw.seniority) || "",
    companySignals: filterKeywordCandidates(raw.companySignals).slice(0, 10),
    disqualifiedNoiseTokens: filterKeywordCandidates(raw.disqualifiedNoiseTokens).slice(0, 20),
  };
}

/**
 * Heuristic fallback when LLM is unavailable — never use unfiltered topKeywords as human-facing requirements.
 */
export function buildFallbackJobUnderstanding(args: {
  title: string;
  snippet: string;
  description: string;
}): JobUnderstanding {
  const blob = `${args.title} ${args.snippet} ${args.description}`;
  const rawTokens = topKeywords(blob, 20);
  const cleaned = filterKeywordCandidates(rawTokens);
  return normalizeUnderstanding({
    roleSummary: firstSentence(args.description) || cleanText(args.title) || "Role",
    mustHaveRequirements: cleaned.slice(0, 8),
    preferredRequirements: cleaned.slice(8, 14),
    responsibilityThemes: [],
    workMode: "",
    seniority: "",
    companySignals: [],
    disqualifiedNoiseTokens: rawTokens.filter((t) => isLikelyNoiseToken(t) || !cleaned.includes(t)).slice(0, 12),
  });
}

export async function extractJobUnderstandingWithLlm(args: {
  title: string;
  company: string;
  location: string;
  description: string;
}): Promise<JobUnderstanding | null> {
  const text = cleanText(args.description);
  if (text.length < MIN_CHARS_FOR_LLM) {
    return null;
  }

  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 6000);
  const prompt = `You are an expert technical recruiter. Extract structured information from this job posting text only.

Return ONLY valid JSON with these exact keys:
- "roleSummary": one or two plain sentences summarizing the role.
- "mustHaveRequirements": array of specific must-have qualifications, skills, or technologies (no navigation/UI words, no HTML/JSON fragments, no GraphQL tokens like "typename", no minified code identifiers).
- "preferredRequirements": array of nice-to-have items.
- "responsibilityThemes": short theme labels (2-4 words) for main responsibilities.
- "workMode": "remote" | "hybrid" | "onsite" | "flex" or "" if unknown.
- "seniority": short label e.g. "senior" | "mid" | "lead" or "".
- "companySignals": product/culture/scale hints mentioned in the posting.
- "disqualifiedNoiseTokens": any repeated junk tokens you noticed that should be ignored (script fragments, encoded chars, field names, etc.).

Context (not the full JD):
title: ${JSON.stringify(args.title)}
company: ${JSON.stringify(args.company)}
location: ${JSON.stringify(args.location)}

Job description:
${JSON.stringify(snippet)}`;

  try {
    const raw = await generateJsonSafe("easy", prompt, 1);
    const parsed = jobUnderstandingSchema.parse(raw);
    return normalizeUnderstanding(parsed);
  } catch {
    return null;
  }
}

export function mergeKeywordsForAts(ju: JobUnderstanding, limit = 14): string[] {
  return uniqueStrings([
    ...ju.mustHaveRequirements,
    ...ju.preferredRequirements.slice(0, 4),
    ...filterKeywordCandidates([ju.workMode, ju.seniority].filter(Boolean)),
  ]).slice(0, limit);
}
