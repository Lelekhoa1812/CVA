import type { JobStage, PipelineCounts, SessionPhase } from "@/lib/auto-apply/state";
import type { ApplicantPreferences, DraftAnswer } from "@/lib/auto-apply/questions";
import type { SearchSource } from "@/lib/search/types";

export type { ApplicantPreferences, DraftAnswer, JobStage, PipelineCounts, SessionPhase };

export type ApplyMode = "manual" | "agent_check" | "agent_submit";

export type AgentState = { status?: "ready" | "blocked" | "failed" | "uncertain" | "submitted" | ""; mode?: string; reason?: string; filled?: number; total?: number; missing?: string[]; confirmation?: string; at?: string; running?: boolean };

export type RunState = { phase?: string; message?: string; stats?: Record<string, number>; updatedAt?: string; startedAt?: string };

export type SessionFilters = {
  location: string;
  workplaceMode: string;
  employmentType: string;
  seniority: string;
  mustHaveKeywords: string[];
  excludeKeywords: string[];
  companyBlacklist: string[];
  applicationLimit: number;
  autoApproveMinFit?: number;
  applyMode?: ApplyMode;
  selectedSources: SearchSource[];
};

export type SessionSummary = {
  _id: string;
  mode: "ai_coaching" | "manual_curate";
  status: string;
  prompt: string;
  filters: SessionFilters;
  run?: RunState;
  lastError?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type JobSummary = {
  _id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  discoveredVia: string;
  url: string;
  applyUrl: string;
  fitScore: number;
  fitVerdict: string;
  scoredBy: string;
  fitReasons: string[];
  fitGaps: string[];
  riskFlags: string[];
  status: JobStage;
  formSource: string;
  ats?: { provider?: string; board?: string; jobId?: string };
  missingAnswers: number;
  answerCount: number;
  hasCoverLetter: boolean;
  postedAt?: string;
  lastError?: string;
  agent?: AgentState;
};

export type EventItem = { _id: string; type: string; message: string; createdAt: string };

export type SessionData = {
  session: SessionSummary;
  jobs: JobSummary[];
  counts: PipelineCounts;
  phase: SessionPhase;
  events: EventItem[];
};

export type JobDetail = {
  job: JobSummary & { descriptionText?: string; resolutionNotes?: string[]; stageHistory?: Array<{ stage: string; at: string; note?: string }> };
  draft: {
    _id: string;
    coverLetterText: string;
    answers: DraftAnswer[];
    applyUrl: string;
    formSource: string;
    finalReviewStatus: string;
    riskNotes: string[];
    letterClaims?: string[];
    generatedBy: string;
    preparedAt?: string;
    approvedAt?: string | null;
  } | null;
};

export type BriefForm = {
  prompt: string;
  mode: "ai_coaching" | "manual_curate";
  location: string;
  applicationLimit: number;
  /** 0 = off. Otherwise a ready draft at or above this fit, with nothing left to check, is approved automatically. */
  autoApproveMinFit: number;
  /** What happens to an approved application: the applicant submits it, or the local agent fills it, or fills and submits it. */
  applyMode: ApplyMode;
  seniority: string;
  workplaceMode: string;
  employmentType: string;
  mustHaveKeywords: string;
  excludeKeywords: string;
  companyBlacklist: string;
  selectedSources: SearchSource[];
};

export const RUNNING_PHASES = new Set(["searching", "scoring", "preparing"]);
