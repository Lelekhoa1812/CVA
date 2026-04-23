import type { JobEvaluationResult, RequirementMatch, StrategistGap, UserContextSnapshot } from "./types";
import { clamp, coverageFromMatches, overlapScore, parseSalaryRange, tokenize, uniqueStrings } from "./utils";

type LeadLike = {
  title: string;
  location: string;
  company: string;
  canonicalJobDescription: string;
  extractedKeywords: string[];
  salaryText: string;
  remotePolicy: string;
  companySignals: string[];
  liveStatus: string;
};

type TelemetryLike = {
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

/* Motivation vs Logic:
   Motivation: The Career Strategist agent needs explainable scoring so the control room can show why a lead should
   be prioritized or skipped instead of hiding the decision inside one opaque prompt response.
   Logic: Score the lead across a stable set of dimensions derived from the persisted UserContext, translate missing
   coverage into explicit gaps, and preserve a telemetry snapshot so future recommendations can calibrate over time. */
export function scoreLeadFit(
  lead: LeadLike,
  context: UserContextSnapshot,
  telemetry: TelemetryLike,
): JobEvaluationResult {
  const roleTokens = tokenize(lead.title);
  const roleTargets = context.targetRoles.flatMap((role) => tokenize(role));
  const candidateKeywords = candidateKeywordPool(context);
  const leadKeywords = lead.extractedKeywords.map((keyword) => keyword.toLowerCase());
  const matchedRequirements = buildRequirementMatches(lead.extractedKeywords, context);
  const criticalGaps = matchedRequirements.filter((match) => match.coverage === "gap").slice(0, 4);

  const roleAlignment = clamp(Math.round(overlapScore(roleTokens, roleTargets) * 100) || 32, 20, 100);
  const skillCoverage = clamp(
    Math.round(
      overlapScore(leadKeywords, candidateKeywords) * 100 +
        matchedRequirements.filter((match) => match.coverage === "covered").length * 4,
    ),
    18,
    100,
  );

  const salary = parseSalaryRange(lead.salaryText);
  const salaryFloor = context.compensation.salaryFloor || context.compensation.targetMin || 0;
  const compensationFit =
    salaryFloor === 0 || salary.maximum === 0
      ? 58
      : salary.maximum >= salaryFloor
        ? 82
        : salary.minimum >= salaryFloor
          ? 68
          : 34;

  const remotePreference = context.workPreferences.remoteOnly;
  const workModeFit =
    remotePreference && lead.remotePolicy !== "remote" && lead.remotePolicy !== "global remote"
      ? 22
      : context.workPreferences.modes.includes("remote") && lead.remotePolicy.includes("remote")
        ? 85
        : lead.remotePolicy === "hybrid"
          ? 63
          : 55;

  const cultureKeywords = context.cultureSignals.map((signal) => signal.label.toLowerCase());
  const cultureFit = clamp(
    Math.round(overlapScore(cultureKeywords, lead.companySignals.map((signal) => signal.toLowerCase())) * 100) || 55,
    35,
    95,
  );

  const historicalFit =
    telemetry.evaluationCount === 0
      ? 60
      : clamp(
          45 +
            telemetry.prioritizedCount * 6 -
            telemetry.skippedCount * 2 +
            matchedRequirements.filter((match) => match.coverage === "covered").length * 3,
          20,
          95,
        );

  const liveSignal = lead.liveStatus === "active" ? 88 : lead.liveStatus === "uncertain" ? 52 : 10;

  const dimensionScores = [
    {
      key: "role_alignment",
      label: "Role alignment",
      score: roleAlignment,
      reason: roleTargets.length
        ? "The title tokens overlap with your saved target roles."
        : "No explicit target-role calibration exists yet, so the fit defaults to cautious neutral.",
    },
    {
      key: "skill_coverage",
      label: "Evidence coverage",
      score: skillCoverage,
      reason: "The strategist matched the lead keywords against persisted candidate facts and story-bank tags.",
    },
    {
      key: "compensation",
      label: "Compensation fit",
      score: compensationFit,
      reason: salaryFloor
        ? "The published or inferred range was compared against your saved compensation floor."
        : "No compensation floor is set yet, so the score stays neutral until you calibrate it.",
    },
    {
      key: "work_mode",
      label: "Work-mode fit",
      score: workModeFit,
      reason: "Remote, hybrid, and location preferences were applied as a hard filter before recommendation.",
    },
    {
      key: "culture",
      label: "Culture signal fit",
      score: cultureFit,
      reason: "Company signals were compared with your saved builder-culture and ownership preferences.",
    },
    {
      key: "liveness",
      label: "Posting quality",
      score: liveSignal,
      reason: "Live-status analysis checks for active application controls and stale-listing patterns.",
    },
    {
      key: "historical",
      label: "Historical calibration",
      score: historicalFit,
      reason: "Past prioritization and self-filtering history nudges the score instead of replacing the current lead fit.",
    },
  ];

  const fitScore = Math.round(dimensionScores.reduce((sum, dimension) => sum + dimension.score, 0) / dimensionScores.length);

  const gapMap: StrategistGap[] = criticalGaps.map((gap) => ({
    title: gap.requirement,
    severity: "moderate" as const,
    detail: `The current context has no direct fact tagged with "${gap.requirement}".`,
    mitigation: "Add a proof point or story-bank entry that shows adjacent evidence before applying.",
  }));

  if (lead.liveStatus === "expired") {
    gapMap.unshift({
      title: "Listing freshness",
      severity: "critical" as const,
      detail: "The Market Analyst flagged this posting as expired.",
      mitigation: "Do not tailor or apply until the live status is manually verified.",
    });
  }

  if (remotePreference && !lead.remotePolicy.includes("remote")) {
    gapMap.unshift({
      title: "Work-mode mismatch",
      severity: "critical" as const,
      detail: "Your context is set to remote-first while the listing is not remote-friendly.",
      mitigation: "Either relax the remote constraint or deprioritize this lead.",
    });
  }

  const recommendation =
    fitScore < context.scoreFloor || gapMap.some((gap) => gap.severity === "critical")
      ? "skip"
      : fitScore >= Math.max(context.scoreFloor, 78)
        ? "prioritize"
        : "consider";

  const nextActions =
    recommendation === "skip"
      ? [
          "Do not generate artifacts automatically.",
          "Capture why this lead was filtered so future strategist recommendations improve.",
        ]
      : [
          "Run the Resume Specialist to create a tailored draft and ATS validation report.",
          "Review the evidence-to-requirement mapping before exporting application assets.",
        ];

  const winningPatterns = telemetry.winningKeywords.slice(0, 3);
  const reasoningSummary = [
    `${lead.company} - ${lead.title} scored ${fitScore}/100.`,
    recommendation === "skip"
      ? "The strategist recommends skipping because the lead falls below your score floor or trips a hard blocker."
      : "The strategist recommends continuing because the lead clears your saved score floor.",
    winningPatterns.length ? `Recent winning patterns still cluster around ${winningPatterns.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    fitScore,
    recommendation,
    dimensionScores,
    gapMap,
    matchedRequirements,
    reasoningSummary,
    nextActions,
    telemetrySnapshot: {
      evaluationCount: telemetry.evaluationCount,
      prioritizedCount: telemetry.prioritizedCount,
      skippedCount: telemetry.skippedCount,
      exclusions: telemetry.commonExclusions,
    },
  };
}
