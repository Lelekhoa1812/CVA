import { buildApiUrl } from "@/lib/api";
import type { ApplicantPreferences, BriefForm, JobDetail, SessionData, SessionSummary } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status}).`, response.status);
  return data;
}

const splitCsv = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function filtersFromBrief(brief: BriefForm) {
  return {
    location: brief.location,
    workplaceMode: brief.workplaceMode,
    employmentType: brief.employmentType,
    seniority: brief.seniority,
    mustHaveKeywords: splitCsv(brief.mustHaveKeywords),
    excludeKeywords: splitCsv(brief.excludeKeywords),
    companyBlacklist: splitCsv(brief.companyBlacklist),
    applicationLimit: brief.applicationLimit,
    selectedSources: brief.selectedSources,
    maxResultsPerSource: 25,
  };
}

export const autoApplyApi = {
  listSessions: () => call<{ sessions: SessionSummary[] }>("/api/auto-apply/session"),
  createSession: (brief: BriefForm) =>
    call<{ session: SessionSummary }>("/api/auto-apply/session", {
      method: "POST",
      body: JSON.stringify({ mode: brief.mode, prompt: brief.prompt, filters: filtersFromBrief(brief) }),
    }),
  getSession: (id: string) => call<SessionData>(`/api/auto-apply/session/${id}`),
  updateSession: (id: string, brief: BriefForm) =>
    call<{ session: SessionSummary }>(`/api/auto-apply/session/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ mode: brief.mode, prompt: brief.prompt, filters: filtersFromBrief(brief) }),
    }),
  run: (id: string, mode?: "prepare") => call<{ started: boolean }>(`/api/auto-apply/session/${id}/run`, { method: "POST", body: JSON.stringify({ mode }) }),
  cancel: (id: string) => call<{ cancelled: boolean }>(`/api/auto-apply/session/${id}/cancel`, { method: "POST" }),
  approve: (id: string, jobIds?: string[], undo?: boolean) =>
    call<{ approved: string[]; skipped: Array<{ id: string; reason: string }> }>(`/api/auto-apply/session/${id}/approve`, { method: "POST", body: JSON.stringify({ jobIds, all: !jobIds, undo }) }),
  refreshAnswers: (id: string) => call<{ updated: number }>(`/api/auto-apply/session/${id}/refresh-answers`, { method: "POST" }),
  getJob: (id: string) => call<JobDetail>(`/api/auto-apply/job/${id}`),
  setStage: (id: string, stage: "selected" | "skipped" | "shortlisted" | "discovered") =>
    call<{ ok: boolean }>(`/api/auto-apply/job/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }),
  saveAnswers: (id: string, body: { answers?: Array<{ questionId: string; value: string; remember?: boolean }>; coverLetterText?: string }) =>
    call<{ ok: boolean }>(`/api/auto-apply/job/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  rewriteCoverLetter: (id: string, advanced: boolean) => call<{ coverLetter: string; mode: string; reviewWarning?: string; fallbackNote?: string }>(`/api/auto-apply/job/${id}/cover-letter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advanced }) }),
  prepare: (id: string) => call<{ outcome: string }>(`/api/auto-apply/job/${id}/prepare`, { method: "POST" }),
  pack: (id: string) => call<{ pack: unknown; text: string; applyUrl: string }>(`/api/auto-apply/job/${id}/pack`),
  markApplied: (id: string, undo = false) => call<{ stage: string }>(`/api/auto-apply/job/${id}/applied`, { method: "POST", body: JSON.stringify(undo ? { undo: true } : { confirm: true }) }),
  getPreferences: () => call<{ preferences: ApplicantPreferences; hasProfile: boolean; profileName: string }>("/api/auto-apply/preferences"),
  savePreferences: (preferences: ApplicantPreferences) => call<{ preferences: ApplicantPreferences }>("/api/auto-apply/preferences", { method: "PUT", body: JSON.stringify(preferences) }),
};
