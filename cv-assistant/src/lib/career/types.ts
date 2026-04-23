import type { SearchRequest, SearchSource } from "@/lib/search/types";

export type WorkMode = "remote" | "hybrid" | "onsite" | "flex";
export type LeadLifecycleState =
  | "lead_found"
  | "enriched"
  | "scored"
  | "tailored"
  | "exported"
  | "tracked"
  | "followup_due";
export type LeadRecommendation = "unscored" | "prioritize" | "consider" | "skip";
export type LiveStatus = "unknown" | "active" | "expired" | "uncertain";
export type GapSeverity = "critical" | "moderate" | "minor";
export type RequirementCoverage = "covered" | "partial" | "gap";

export type CompensationPreference = {
  currency: string;
  targetMin: number;
  targetMax: number;
  salaryFloor: number;
};

export type SearchPreferenceState = {
  jobTitles: string[];
  locations: string[];
  sources: SearchSource[];
  remoteOnly: boolean;
};

export type ControlRoomPreferenceState = {
  scoreFloor: string;
  salaryFloor: string;
  targetMin: string;
  targetMax: string;
  jobTitles: string;
  locations: string;
  preferredLocations: string;
  avoidLocations: string;
  remoteOnly: boolean;
};

export type UserContextSnapshot = {
  targetRoles: string[];
  archetypes: string[];
  compensation: CompensationPreference;
  workPreferences: {
    modes: WorkMode[];
    preferredLocations: string[];
    avoidLocations: string[];
    visaStatus: string;
    remoteOnly: boolean;
  };
  searchPreferences: SearchPreferenceState;
  techStackPreferences: string[];
  cultureSignals: Array<{ label: string; weight: number }>;
  proofPoints: string[];
  learnedExclusions: string[];
  scoreFloor: number;
  outreachPreferences: {
    channels: string[];
    tone: string;
  };
  controlRoomPreferences?: ControlRoomPreferenceState;
  candidateFacts: Array<{
    kind: string;
    title: string;
    sourceLabel: string;
    summary: string;
    evidence: string[];
    keywords: string[];
    impact: string;
    confidence: number;
  }>;
  storyBank: Array<{
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
    tags: string[];
    confidence: number;
  }>;
};

export type PersistedSearchCampaignInput = SearchRequest;

/** LLM (or fallback) structured extraction from a job posting — replaces raw word frequency as the strategist input. */
export type JobUnderstanding = {
  roleSummary: string;
  mustHaveRequirements: string[];
  preferredRequirements: string[];
  responsibilityThemes: string[];
  workMode: string;
  seniority: string;
  companySignals: string[];
  disqualifiedNoiseTokens: string[];
};

export type AnalysisSource = "heuristic" | "llm" | "fallback";

export const CONTROL_ROOM_ANALYSIS_VERSION = 2 as const;

export type EnrichedLeadFacts = {
  canonicalJobDescription: string;
  jobUnderstanding: JobUnderstanding | null;
  extractedKeywords: string[];
  salaryText: string;
  remotePolicy: string;
  employmentType: string;
  companySignals: string[];
  liveStatus: LiveStatus;
};

export type StrategistDimensionScore = {
  key: string;
  label: string;
  score: number;
  reason: string;
};

export type StrategistGap = {
  /** Stable id for analytics/heatmap, e.g. `missing_evidence_tech` */
  code?: string;
  title: string;
  severity: GapSeverity;
  detail: string;
  mitigation: string;
  supportingRequirements?: string[];
};

export type RequirementMatch = {
  requirement: string;
  coverage: RequirementCoverage;
  matchedFacts: string[];
};

export type JobEvaluationResult = {
  fitScore: number;
  recommendation: Exclude<LeadRecommendation, "unscored">;
  dimensionScores: StrategistDimensionScore[];
  gapMap: StrategistGap[];
  matchedRequirements: RequirementMatch[];
  reasoningSummary: string;
  nextActions: string[];
  telemetrySnapshot: Record<string, unknown>;
  /** v2 strategist: how this evaluation was produced. */
  analysisSource: AnalysisSource;
  analysisVersion: number;
  model: string;
  jobUnderstanding: JobUnderstanding | null;
};

export type ResumeDraft = {
  headline: string;
  summary: string;
  competencies: string[];
  experiences: Array<{
    company: string;
    role: string;
    period: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    label: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    credential: string;
    period: string;
  }>;
  skills: string[];
  languages: string[];
  requirementCoverage: RequirementMatch[];
};

export type AtsValidationReport = {
  supportedClaims: number;
  unsupportedClaims: number;
  keywordCoverage: number;
  missingKeywords: string[];
  warnings: string[];
  passed: boolean;
};

export type TailoringResult = {
  evidenceSet: Array<{
    type: "project" | "experience";
    index: number;
    title: string;
    score: number;
    matchedKeywords: string[];
    rewrittenContent: string;
  }>;
  resumeDraft: ResumeDraft;
  atsValidation: AtsValidationReport;
  artifacts: Array<{
    artifactType: "resume_html" | "resume_json";
    variant: "executive" | "clean" | "modern";
    mimeType: string;
    body: string;
    summary: string;
  }>;
};
