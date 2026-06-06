import { z } from "zod";
import { generateJsonSafe } from "@/lib/ai";
import { SEARCH_SOURCES, type SearchSource } from "@/lib/search/types";
import { buildGroundTruthOptions, suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";
import type { Profile } from "@/lib/models/User";

const RECENT_EXPERIENCE_PRIORITY_K = 4;
const MAX_PROMPT_WORDS = 8;
const MAX_PROMPT_SPECIALTIES = 2;
const MAX_MUST_HAVE_KEYWORDS = 4;
const MAX_EXCLUDE_KEYWORDS = 4;
const MAX_COMPANY_BLACKLIST = 12;
const KEYWORD_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "role",
  "job",
  "software",
  "engineer",
  "developer",
  "professional",
  "experience",
  "experienced",
  "years",
  "year",
  "using",
  "focused",
  "focus",
  "building",
  "strong",
  "skills",
  "skill",
  "team",
  "teams",
  "player",
  "communication",
  "problem",
  "solving",
]);

const profileDraftSchema = z.object({
  prompt: z.string().default(""),
  location: z.string().default(""),
  workplaceMode: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
  employmentType: z.enum(["any", "full-time", "part-time", "contract", "internship"]).default("any"),
  seniority: z.string().default(""),
  salaryMin: z.string().default(""),
  salaryMax: z.string().default(""),
  workRights: z.string().default(""),
  mustHaveKeywords: z.array(z.string()).default([]),
  excludeKeywords: z.array(z.string()).default([]),
  companyBlacklist: z.array(z.string()).default([]),
  applicationLimit: z.number().int().min(1).max(100).default(10),
  selectedSources: z.array(z.enum(SEARCH_SOURCES)).default([...SEARCH_SOURCES]),
  selectedGroundTruthIds: z.array(z.string()).default([]),
  reasoning: z.string().default(""),
});

export type AutoApplyProfileDraft = z.infer<typeof profileDraftSchema>;

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string) {
  return cleanText(value).toLowerCase();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeToken(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenize(value: string) {
  return normalizeToken(value)
    .split(/[^a-z0-9+#./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !KEYWORD_STOP_WORDS.has(token));
}

function splitKeywordPhrases(values: string[]) {
  return values.flatMap((value) =>
    cleanText(value)
      .split(/[\n,;|]+|(?:\s\/\s)/)
      .map((part) => cleanText(part))
      .filter(Boolean),
  );
}

function looksLowSignalKeyword(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return true;
  const tokens = tokenize(cleaned);
  if (!tokens.length) return true;
  if (tokens.length === 1 && tokens[0].length <= 2) return true;
  return tokens.every((token) => KEYWORD_STOP_WORDS.has(token));
}

function sanitizeKeywordList(values: string[], max: number) {
  return dedupeStrings(splitKeywordPhrases(values))
    .filter((value) => !looksLowSignalKeyword(value))
    .sort((left, right) => {
      const leftTokens = tokenize(left).length;
      const rightTokens = tokenize(right).length;
      return rightTokens - leftTokens || left.length - right.length;
    })
    .slice(0, max);
}

function extractCompactRole(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  const firstClause = cleaned.split(/[.!?]/)[0] || cleaned;
  const trimmedClause = firstClause
    .split(/\b(?:with|focused on|specializing in|specialised in|experienced in|using|across)\b/i)[0]
    ?.trim() || "";
  const roleWords = trimmedClause.split(/\s+/).filter(Boolean);
  if (!roleWords.length) return "";
  return roleWords.slice(0, MAX_PROMPT_WORDS).join(" ");
}

function buildCompactPrompt(args: {
  currentPrompt?: string;
  seniority?: string;
  recentExperiences: Array<{ role: string }>;
  mustHaveKeywords: string[];
}) {
  const currentPrompt = extractCompactRole(args.currentPrompt || "");
  if (currentPrompt && currentPrompt.split(/\s+/).length <= MAX_PROMPT_WORDS) {
    return currentPrompt;
  }

  const recentRole = args.recentExperiences.map((item) => extractCompactRole(item.role)).find(Boolean) || "";
  const role = recentRole || currentPrompt;
  const seniority = cleanText(args.seniority);
  const specialties = sanitizeKeywordList(args.mustHaveKeywords, MAX_PROMPT_SPECIALTIES).filter((keyword) => {
    const normalizedKeyword = normalizeToken(keyword);
    return normalizedKeyword && !normalizeToken(role).includes(normalizedKeyword);
  });

  const promptParts = [
    seniority && !normalizeToken(role).includes(normalizeToken(seniority)) ? seniority : "",
    role,
    ...specialties,
  ].filter(Boolean);
  return cleanText(promptParts.join(" ")).split(/\s+/).slice(0, MAX_PROMPT_WORDS).join(" ");
}

function profileSummary(profile?: Partial<Profile> | null) {
  return {
    name: cleanText(profile?.name),
    major: cleanText(profile?.major),
    school: cleanText(profile?.school),
    studyPeriod: cleanText(profile?.studyPeriod),
    skills: cleanText(profile?.skills),
    languages: cleanText(profile?.languages),
    projects: (profile?.projects || []).map((project) => ({
      name: cleanText(project.name),
      summary: cleanText(project.summary),
      description: cleanText(project.description),
    })),
    experiences: (profile?.experiences || []).map((experience) => ({
      companyName: cleanText(experience.companyName),
      role: cleanText(experience.role),
      summary: cleanText(experience.summary),
      description: cleanText(experience.description),
      timeFrom: cleanText(experience.timeFrom),
      timeTo: cleanText(experience.timeTo),
    })),
  };
}

export function refineAutoApplyProfileDraft(
  draft: Partial<AutoApplyProfileDraft>,
  profile?: Partial<Profile> | null,
) {
  const summary = profileSummary(profile);
  const recentExperiences = summary.experiences.slice(0, RECENT_EXPERIENCE_PRIORITY_K);
  const mustHaveKeywords = sanitizeKeywordList(draft.mustHaveKeywords || [], MAX_MUST_HAVE_KEYWORDS);
  const excludeKeywords = sanitizeKeywordList(draft.excludeKeywords || [], MAX_EXCLUDE_KEYWORDS).filter(
    (keyword) => !mustHaveKeywords.some((mustHave) => normalizeToken(mustHave) === normalizeToken(keyword)),
  );

  return profileDraftSchema.parse({
    ...draft,
    prompt: buildCompactPrompt({
      currentPrompt: draft.prompt,
      seniority: draft.seniority,
      recentExperiences,
      mustHaveKeywords,
    }),
    location: cleanText(draft.location),
    seniority: cleanText(draft.seniority),
    salaryMin: cleanText(draft.salaryMin),
    salaryMax: cleanText(draft.salaryMax),
    workRights: cleanText(draft.workRights),
    mustHaveKeywords,
    excludeKeywords,
    companyBlacklist: dedupeStrings((draft.companyBlacklist || []).map((value) => cleanText(value))).slice(
      0,
      MAX_COMPANY_BLACKLIST,
    ),
    reasoning: cleanText(draft.reasoning),
  });
}

function fallbackDraft(profile?: Partial<Profile> | null, current?: Partial<AutoApplyProfileDraft>) {
  const prompt = cleanText(current?.prompt);
  const selectedGroundTruthIds = prompt ? suggestGroundTruthSelection(profile, prompt) : [];

  return refineAutoApplyProfileDraft({
    prompt,
    location: current?.location || "",
    workplaceMode: current?.workplaceMode || "any",
    employmentType: current?.employmentType || "any",
    seniority: current?.seniority || "",
    salaryMin: current?.salaryMin || "",
    salaryMax: current?.salaryMax || "",
    workRights: current?.workRights || "",
    mustHaveKeywords: current?.mustHaveKeywords || [],
    excludeKeywords: current?.excludeKeywords || [],
    companyBlacklist: current?.companyBlacklist || [],
    applicationLimit: current?.applicationLimit || 10,
    selectedSources: current?.selectedSources?.length ? current.selectedSources : [...SEARCH_SOURCES],
    selectedGroundTruthIds,
    reasoning: "Profile draft unavailable because the intake model did not return a usable result.",
  }, profile);
}

export async function distillAutoApplyProfileDraft(
  profile?: Partial<Profile> | null,
  current?: Partial<AutoApplyProfileDraft>,
) {
  const summary = profileSummary(profile);
  const recentExperiences = summary.experiences.slice(0, RECENT_EXPERIENCE_PRIORITY_K);
  const items = buildGroundTruthOptions(profile)
    .map((item, index) => ({
      index,
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      evidence: item.evidence,
    }))
    .slice(0, 20);

  try {
    const prompt = `You are an Auto Apply intake agent. Distill the user's profile into a concise application search draft.

Use only the information in the profile. Do not invent location, work rights, salary, or credentials.
Write with restrained, high-signal language. Prefer short fields over comprehensive ones.
Keep the main prompt to one compact sentence. Keep keyword arrays short and practical.
Prioritize evidence from the most recent ${RECENT_EXPERIENCE_PRIORITY_K} experiences first. Only pull older experience or project evidence when it adds a clearly relevant specialization that the recent experience set misses.
If a field is unknown, return an empty string or empty array instead of guessing.
Return only valid JSON with this exact shape:
{
  "prompt": string,
  "location": string,
  "workplaceMode": "any" | "remote" | "hybrid" | "onsite",
  "employmentType": "any" | "full-time" | "part-time" | "contract" | "internship",
  "seniority": string,
  "salaryMin": string,
  "salaryMax": string,
  "workRights": string,
  "mustHaveKeywords": string[],
  "excludeKeywords": string[],
  "companyBlacklist": string[],
  "applicationLimit": number,
  "selectedSources": string[],
  "selectedGroundTruthIds": string[],
  "reasoning": string
}

Current form baseline:
${JSON.stringify(current || {}, null, 2)}

Profile:
${JSON.stringify(summary, null, 2)}

Most recent priority experiences:
${JSON.stringify(recentExperiences, null, 2)}

Selectable ground truth items:
${JSON.stringify(items, null, 2)}

Prioritize the strongest evidence-backed skills, projects, and experiences. Keep the draft concise, recent, and easy for a user to scan.`;

    const raw = await generateJsonSafe("easy", prompt);
    const parsed = profileDraftSchema.parse(raw);
    const refined = refineAutoApplyProfileDraft(parsed, profile);
    const mapped = {
      ...current,
      ...refined,
      selectedSources: Array.isArray(refined.selectedSources)
        ? refined.selectedSources.filter((source): source is SearchSource => SEARCH_SOURCES.includes(source as SearchSource))
        : [...SEARCH_SOURCES],
      selectedGroundTruthIds: refined.selectedGroundTruthIds
        .map((id) => items.find((item) => item.id === id)?.id)
        .filter((id): id is string => Boolean(id)),
    };

    return profileDraftSchema.parse({
      ...fallbackDraft(profile, current),
      ...mapped,
      selectedGroundTruthIds: mapped.selectedGroundTruthIds.length
        ? mapped.selectedGroundTruthIds
        : suggestGroundTruthSelection(profile, mapped.prompt),
      reasoning: refined.reasoning || "Distilled from the profile with an agent pass.",
    });
  } catch {
    return fallbackDraft(profile, current);
  }
}
