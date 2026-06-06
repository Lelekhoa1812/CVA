import { z } from "zod";
import { generateJsonSafe } from "@/lib/ai";
import { SEARCH_SOURCES, type SearchSource } from "@/lib/search/types";
import { buildGroundTruthOptions, suggestGroundTruthSelection } from "@/lib/auto-apply/ground-truth";
import type { Profile } from "@/lib/models/User";

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

function fallbackDraft(profile?: Partial<Profile> | null, current?: Partial<AutoApplyProfileDraft>) {
  const prompt = cleanText(current?.prompt);
  const selectedGroundTruthIds = prompt ? suggestGroundTruthSelection(profile, prompt) : [];

  return profileDraftSchema.parse({
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
  });
}

export async function distillAutoApplyProfileDraft(
  profile?: Partial<Profile> | null,
  current?: Partial<AutoApplyProfileDraft>,
) {
  const summary = profileSummary(profile);
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

Selectable ground truth items:
${JSON.stringify(items, null, 2)}

Prioritize the strongest evidence-backed skills, projects, and experiences. Keep the prompt specific and practical.`;

    const raw = await generateJsonSafe("easy", prompt);
    const parsed = profileDraftSchema.parse(raw);
    const mapped = {
      ...current,
      ...parsed,
      selectedSources: Array.isArray(parsed.selectedSources)
        ? parsed.selectedSources.filter((source): source is SearchSource => SEARCH_SOURCES.includes(source as SearchSource))
        : [...SEARCH_SOURCES],
      selectedGroundTruthIds: parsed.selectedGroundTruthIds
        .map((id) => items.find((item) => item.id === id)?.id)
        .filter((id): id is string => Boolean(id)),
    };

    return profileDraftSchema.parse({
      ...fallbackDraft(profile, current),
      ...mapped,
      selectedGroundTruthIds: mapped.selectedGroundTruthIds.length
        ? mapped.selectedGroundTruthIds
        : suggestGroundTruthSelection(profile, mapped.prompt),
      reasoning: parsed.reasoning || "Distilled from the profile with an agent pass.",
    });
  } catch {
    return fallbackDraft(profile, current);
  }
}
