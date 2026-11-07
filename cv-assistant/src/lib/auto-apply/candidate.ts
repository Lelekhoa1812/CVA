import type { Profile } from "@/lib/models/User";
import { EMPTY_PREFERENCES, type ApplicantPreferences, type CandidateProfile } from "./questions";

type LooseProfile = Partial<Profile> & {
  experiences?: Array<{ companyName?: string; role?: string; location?: string; timeFrom?: string; timeTo?: string; summary?: string; description?: string }>;
  projects?: Array<{ name?: string; summary?: string; description?: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function hasUsableProfile(profile?: LooseProfile | null) {
  return Boolean(profile && (clean(profile.name) || (profile.experiences || []).length || clean(profile.skills)));
}

export function candidateContact(profile?: LooseProfile | null, preferences?: Partial<ApplicantPreferences>): CandidateProfile {
  const recentLocation = (profile?.experiences || []).map((experience) => clean(experience.location)).find(Boolean) || "";
  const ongoing = (profile?.experiences || []).find((experience) => {
    const to = clean((experience as { timeTo?: string }).timeTo);
    return Boolean((experience as { normalizedTimeToIsPresent?: boolean }).normalizedTimeToIsPresent) || /^(present|current|now|ongoing)$/i.test(to);
  });
  return {
    currentEmployer: ongoing ? clean(ongoing.companyName) : "",
    employers: (profile?.experiences || []).map((experience) => clean(experience.companyName)).filter(Boolean),
    name: clean(profile?.name),
    email: clean(profile?.email),
    workEmail: clean(profile?.workEmail),
    phone: clean(profile?.phone),
    website: clean(profile?.website),
    linkedin: clean(profile?.linkedin),
    location: clean(preferences?.currentLocation) || recentLocation,
  };
}

export function mergePreferences(...sources: Array<Partial<ApplicantPreferences> | null | undefined>): ApplicantPreferences {
  const merged: ApplicantPreferences = { ...EMPTY_PREFERENCES };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(EMPTY_PREFERENCES) as Array<keyof ApplicantPreferences>) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) (merged as Record<string, string>)[key] = value.trim();
    }
  }
  return merged;
}

/** Compact, evidence-only candidate summary used by scoring and answer drafting prompts. */
export function buildCandidateSummary(profile?: LooseProfile | null, resumeText = "", maxChars = 6000) {
  const lines: string[] = [];
  if (clean(profile?.name)) lines.push(`Name: ${clean(profile?.name)}`);
  if (clean(profile?.profileSummary)) lines.push(`Summary: ${clean(profile?.profileSummary)}`);
  if (clean(profile?.skills)) lines.push(`Skills: ${clean(profile?.skills)}`);
  const education = [clean(profile?.major), clean(profile?.school), clean(profile?.studyPeriod)].filter(Boolean).join(", ");
  if (education) lines.push(`Education: ${education}`);
  if (clean(profile?.languages)) lines.push(`Languages: ${clean(profile?.languages)}`);
  const experiences = (profile?.experiences || []).slice(0, 10).map((experience) => {
    const period = [clean(experience.timeFrom), clean(experience.timeTo)].filter(Boolean).join(" - ");
    const body = clean(experience.summary) || clean(experience.description);
    return `- ${clean(experience.role)} at ${clean(experience.companyName)}${period ? ` (${period})` : ""}${clean(experience.location) ? `, ${clean(experience.location)}` : ""}: ${body.slice(0, 420)}`;
  });
  if (experiences.length) lines.push(`Experience:\n${experiences.join("\n")}`);
  const projects = (profile?.projects || []).slice(0, 8).map((project) => `- ${clean(project.name)}: ${(clean(project.summary) || clean(project.description)).slice(0, 260)}`);
  if (projects.length) lines.push(`Projects:\n${projects.join("\n")}`);
  let summary = lines.join("\n");
  if (summary.length < 400 && resumeText.trim()) summary = `${summary}\nResume text:\n${resumeText.trim()}`;
  return summary.slice(0, maxChars);
}

export function totalExperienceYears(profile?: LooseProfile | null) {
  const years = (profile?.experiences || [])
    .flatMap((experience) => [clean(experience.timeFrom), clean(experience.timeTo)])
    .map((value) => Number(value.match(/(19|20)\d{2}/)?.[0]))
    .filter((value) => Number.isFinite(value));
  if (!years.length) return 0;
  const hasPresent = (profile?.experiences || []).some((experience) => /present|current|now/i.test(clean(experience.timeTo)));
  const max = hasPresent ? new Date().getFullYear() : Math.max(...years);
  return Math.max(0, max - Math.min(...years));
}
