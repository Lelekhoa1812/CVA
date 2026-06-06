export type GroundTruthProject = {
  _id?: unknown;
  name?: string;
  summary?: string;
  description?: string;
};

export type GroundTruthExperience = {
  _id?: unknown;
  companyName?: string;
  role?: string;
  timeFrom?: string;
  timeTo?: string;
  summary?: string;
  description?: string;
};

export type GroundTruthProfile = {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  skills?: string;
  languages?: string;
  projects?: GroundTruthProject[];
  experiences?: GroundTruthExperience[];
};

function idOf(value: unknown, fallback: string) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return fallback;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildGroundTruthOptions(profile?: GroundTruthProfile | null) {
  const projects = (profile?.projects || []).map((project, index) => ({
    id: `project:${idOf(project._id, `${index}`)}`,
    kind: "project",
    title: clean(project.name) || "Untitled project",
    summary: clean(project.summary || project.description),
    evidence: [clean(project.summary), clean(project.description)].filter(Boolean),
  }));

  const experiences = (profile?.experiences || []).map((experience, index) => ({
    id: `experience:${idOf(experience._id, `${index}`)}`,
    kind: "experience",
    title:
      [clean(experience.companyName), clean(experience.role)].filter(Boolean).join(" - ") ||
      "Untitled experience",
    summary: clean(experience.summary || experience.description),
    evidence: [
      clean(experience.companyName),
      clean(experience.role),
      clean(experience.timeFrom),
      clean(experience.timeTo),
      clean(experience.summary),
      clean(experience.description),
    ].filter(Boolean),
  }));

  const skills = clean(profile?.skills)
    ? [
        {
          id: "profile:skills",
          kind: "skill",
          title: "Profile skills",
          summary: clean(profile?.skills),
          evidence: [clean(profile?.skills)],
        },
      ]
    : [];

  const profileFacts = [
    ["profile:name", "Name", profile?.name],
    ["profile:education", "Education", [profile?.major, profile?.school, profile?.studyPeriod].filter(Boolean).join(", ")],
    ["profile:languages", "Languages", profile?.languages],
  ]
    .filter(([, , value]) => clean(value).length > 0)
    .map(([id, title, value]) => ({
      id: id as string,
      kind: "profile",
      title: title as string,
      summary: clean(value),
      evidence: [clean(value)],
    }));

  return [...experiences, ...projects, ...skills, ...profileFacts];
}

export function buildGroundTruthSnapshot(
  profile: GroundTruthProfile | null | undefined,
  selectedIds: string[],
  allowFullResumeContext: boolean,
) {
  const options = buildGroundTruthOptions(profile);
  const selected = allowFullResumeContext
    ? options
    : options.filter((item) => selectedIds.includes(item.id));

  return {
    allowFullResumeContext,
    selectedIds,
    items: selected,
    createdAt: new Date().toISOString(),
  };
}

export function flattenGroundTruthText(snapshot: { items?: Array<{ title?: string; summary?: string; evidence?: string[] }> }) {
  return (snapshot.items || [])
    .flatMap((item) => [item.title || "", item.summary || "", ...(item.evidence || [])])
    .join("\n")
    .toLowerCase();
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["and", "the", "for", "with", "role", "job"].includes(token));
}

export function suggestGroundTruthSelection(
  profile: GroundTruthProfile | null | undefined,
  prompt: string,
  limit = 6,
) {
  const items = buildGroundTruthOptions(profile);
  const promptTokens = new Set(tokenize(prompt));

  return items
    .map((item, index) => {
      const haystack = [item.title, item.summary, ...(item.evidence || [])].join(" ").toLowerCase();
      const tokenOverlap = [...promptTokens].filter((token) => haystack.includes(token));
      const profileBonus =
        item.kind === "experience" ? 3 : item.kind === "project" ? 2 : 1;

      return {
        ...item,
        index,
        score: tokenOverlap.length * 4 + profileBonus + Math.min(5, item.evidence?.length || 0),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.id);
}
