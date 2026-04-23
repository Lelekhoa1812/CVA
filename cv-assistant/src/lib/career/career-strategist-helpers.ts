import type { JobUnderstanding, RequirementMatch, UserContextSnapshot } from "./types";
import { coverageFromMatches, uniqueStrings } from "./utils";

export type LeadLike = {
  title: string;
  location: string;
  company: string;
  canonicalJobDescription: string;
  extractedKeywords: string[];
  salaryText: string;
  remotePolicy: string;
  companySignals: string[];
  liveStatus: string;
  jobUnderstanding?: JobUnderstanding | null;
};

export type TelemetryLike = {
  evaluationCount: number;
  skippedCount: number;
  prioritizedCount: number;
  commonExclusions: string[];
  winningKeywords: string[];
};

function candidateKeywordPool(context: UserContextSnapshot) {
  return uniqueStrings([
    ...context.techStackPreferences,
    ...context.candidateFacts.flatMap((fact) => fact.keywords),
    ...context.targetRoles,
    ...context.storyBank.flatMap((story) => story.tags),
  ]).map((value) => value.toLowerCase());
}

/**
 * Heuristic coverage — used for fallback and telemetry when LLM is unavailable.
 * Prefer `jobUnderstanding.mustHaveRequirements` as keyword source when the caller passes an augmented list in `requirementSeeds`.
 */
export function buildRequirementMatches(
  keywords: string[],
  context: UserContextSnapshot,
): RequirementMatch[] {
  const candidatePool = candidateKeywordPool(context);
  const factMatches = context.candidateFacts.map((fact) => ({
    label: fact.title || fact.sourceLabel,
    tokens: fact.keywords.map((keyword) => keyword.toLowerCase()),
  }));

  return keywords.slice(0, 8).map((keyword) => {
    const normalized = keyword.toLowerCase();
    const matchedFacts = factMatches
      .filter((fact) => fact.tokens.includes(normalized))
      .map((fact) => fact.label)
      .filter(Boolean);

    return {
      requirement: keyword,
      coverage: coverageFromMatches(matchedFacts.length + (candidatePool.includes(normalized) ? 1 : 0)),
      matchedFacts,
    };
  });
}
