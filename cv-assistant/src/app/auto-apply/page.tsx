"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { buildApiUrl } from "@/lib/api";
import { buildGroundTruthOptions } from "@/lib/auto-apply/ground-truth";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SEARCH_SOURCES,
  SOURCE_LABELS,
  WORKPLACE_MODE_OPTIONS,
  type EmploymentType,
  type SearchSource,
  type WorkplaceMode,
} from "@/lib/search/types";

type Mode = "ai_coaching" | "manual_curate";
type Tab = "prompt" | "jobs" | "apply" | "activity";

type GroundTruthOption = ReturnType<typeof buildGroundTruthOptions>[number];

type Session = {
  _id: string;
  mode: Mode;
  status: string;
  prompt: string;
  filters: Record<string, unknown>;
  uploadedResumeId?: string | null;
  selectedGroundTruthIds: string[];
};

type Job = {
  _id: string;
  title: string;
  company: string;
  location: string;
  source: SearchSource;
  fitScore: number;
  fitReasons: string[];
  missingRequirements: string[];
  riskFlags: string[];
  applicationStrategy: string;
  status: string;
  applyUrl: string;
};

type Draft = {
  _id: string;
  jobCandidateId: string;
  coverLetterText: string;
  generatedApplicationSummary: string;
  finalReviewStatus: string;
  riskNotes: string[];
};

type EventItem = {
  _id: string;
  type: string;
  message: string;
  createdAt: string;
};

const workplaceLabels: Record<WorkplaceMode, string> = {
  any: "Any workplace",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const employmentLabels: Record<EmploymentType, string> = {
  any: "Any type",
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
};

const initialAutoApplyForm = {
  prompt: "",
  mode: "ai_coaching" as Mode,
  location: "",
  workplaceMode: "any" as WorkplaceMode,
  employmentType: "any" as EmploymentType,
  seniority: "",
  salaryMin: "",
  salaryMax: "",
  workRights: "",
  mustHaveKeywords: "",
  excludeKeywords: "",
  companyBlacklist: "",
  applicationLimit: "10",
  selectedSources: [...SEARCH_SOURCES] as SearchSource[],
  selectedGroundTruthIds: [] as string[],
  allowFullResumeContext: false,
};

function buildGroundTruthSections(items: GroundTruthOption[]) {
  const groups = {
    experiences: [] as Array<{ id: string; label: string; detail: string }>,
    projects: [] as Array<{ id: string; label: string; detail: string }>,
    profileFacts: [] as Array<{ id: string; label: string; detail: string }>,
  };

  items.forEach((item) => {
    const mapped = {
      id: item.id,
      label: item.title || "Untitled",
      detail: item.summary || item.evidence?.join(" ") || "",
    };

    if (item.kind === "experience") {
      groups.experiences.push(mapped);
      return;
    }

    if (item.kind === "project") {
      groups.projects.push(mapped);
      return;
    }

    groups.profileFacts.push(mapped);
  });

  return groups;
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AutoApplyPage() {
  const [activeTab, setActiveTab] = useState<Tab>("prompt");
  const [groundTruthOptions, setGroundTruthOptions] = useState<GroundTruthOption[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [question, setQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [saveReusable, setSaveReusable] = useState(false);
  const [showGroundTruthSelection, setShowGroundTruthSelection] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Ready to create an applying session.");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [form, setForm] = useState(initialAutoApplyForm);

  const groundTruthSections = useMemo(() => buildGroundTruthSections(groundTruthOptions), [groundTruthOptions]);
  const selectedJob = jobs.find((job) => job._id === selectedJobId) || jobs[0];
  const selectedDraft = drafts.find((draft) => draft.jobCandidateId === selectedJob?._id) || drafts[0];

  useEffect(() => {
    const loadInitial = async () => {
      const [sessionsResponse, draftResponse] = await Promise.all([
        fetch(buildApiUrl("/api/auto-apply/session")),
        fetch(buildApiUrl("/api/auto-apply/profile-draft"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...initialAutoApplyForm,
          }),
        }),
      ]);
      const sessionData = await sessionsResponse.json().catch(() => ({}));
      const draftData = await draftResponse.json().catch(() => ({}));
      setSessions(sessionData.sessions || []);
      setGroundTruthOptions(draftData.groundTruthOptions || []);
      if (draftData.draft) {
        setForm((current) => ({
          ...current,
          prompt: draftData.draft.prompt || current.prompt,
          location: draftData.draft.location || current.location,
          workplaceMode: draftData.draft.workplaceMode || current.workplaceMode,
          employmentType: draftData.draft.employmentType || current.employmentType,
          seniority: draftData.draft.seniority || current.seniority,
          salaryMin: draftData.draft.salaryMin || current.salaryMin,
          salaryMax: draftData.draft.salaryMax || current.salaryMax,
          workRights: draftData.draft.workRights || current.workRights,
          mustHaveKeywords: (draftData.draft.mustHaveKeywords || current.mustHaveKeywords)
            .filter(Boolean)
            .join(", "),
          excludeKeywords: (draftData.draft.excludeKeywords || current.excludeKeywords)
            .filter(Boolean)
            .join(", "),
          companyBlacklist: (draftData.draft.companyBlacklist || current.companyBlacklist)
            .filter(Boolean)
            .join(", "),
          applicationLimit: String(
            draftData.draft.applicationLimit || Number.parseInt(current.applicationLimit, 10) || 10,
          ),
          selectedSources: draftData.draft.selectedSources?.length
            ? draftData.draft.selectedSources
            : current.selectedSources,
          selectedGroundTruthIds: draftData.draft.selectedGroundTruthIds?.length
            ? draftData.draft.selectedGroundTruthIds
            : current.selectedGroundTruthIds,
        }));
        if (draftData.draft.reasoning) {
          setStatusMessage(`Profile draft ready: ${draftData.draft.reasoning}`);
        }
      } else if (draftData.error) {
        setError(draftData.error);
      }
    };

    void loadInitial();
  }, []);

  async function syncSessionFromForm() {
    if (!session) return;
    const response = await fetch(buildApiUrl(`/api/auto-apply/session/${session._id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: form.mode,
        prompt: form.prompt,
        filters: {
          location: form.location,
          workplaceMode: form.workplaceMode,
          employmentType: form.employmentType,
          seniority: form.seniority,
          salaryMin: form.salaryMin,
          salaryMax: form.salaryMax,
          workRights: form.workRights,
          mustHaveKeywords: splitCsv(form.mustHaveKeywords),
          excludeKeywords: splitCsv(form.excludeKeywords),
          companyBlacklist: splitCsv(form.companyBlacklist),
          applicationLimit: Number.parseInt(form.applicationLimit, 10) || 10,
          selectedSources: form.selectedSources,
          maxResultsPerSource: 25,
        },
        selectedGroundTruthIds: form.selectedGroundTruthIds,
        allowFullResumeContext: form.allowFullResumeContext,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to update session.");
    setSession(data.session);
  }

  async function refreshSession(sessionId = session?._id) {
    if (!sessionId) return;
    const response = await fetch(buildApiUrl(`/api/auto-apply/session/${sessionId}`));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to refresh session.");
    setSession(data.session);
    setJobs(data.jobs || []);
    setDrafts(data.drafts || []);
    setEvents(data.events || []);
    setSelectedJobId((current) => current || data.jobs?.[0]?._id || "");
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl("/api/auto-apply/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: form.mode,
          prompt: form.prompt,
          filters: {
            location: form.location,
            workplaceMode: form.workplaceMode,
            employmentType: form.employmentType,
            seniority: form.seniority,
            salaryMin: form.salaryMin,
            salaryMax: form.salaryMax,
            workRights: form.workRights,
            mustHaveKeywords: splitCsv(form.mustHaveKeywords),
            excludeKeywords: splitCsv(form.excludeKeywords),
            companyBlacklist: splitCsv(form.companyBlacklist),
            applicationLimit: Number.parseInt(form.applicationLimit, 10) || 10,
            selectedSources: form.selectedSources,
            maxResultsPerSource: 25,
          },
          selectedGroundTruthIds: form.selectedGroundTruthIds,
          allowFullResumeContext: form.allowFullResumeContext,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create session.");
      setSession(data.session);
      setSessions((current) => [data.session, ...current.filter((item) => item._id !== data.session._id)]);
      setStatusMessage("Session created. Upload a resume to unlock application preparation.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create session.");
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadFile(kind: "resume" | "document", file?: File | null) {
    if (!session || !file) return;
    setIsBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint =
        kind === "resume"
          ? `/api/auto-apply/session/${session._id}/upload-resume`
          : `/api/auto-apply/session/${session._id}/upload-document`;
      const response = await fetch(buildApiUrl(endpoint), { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setStatusMessage(kind === "resume" ? "Resume uploaded." : "Supporting document uploaded.");
      await refreshSession(session._id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function runSessionAction(action: "search" | "rank") {
    if (!session) return;
    setIsBusy(true);
    setError("");
    try {
      await syncSessionFromForm();
      const response = await fetch(buildApiUrl(`/api/auto-apply/session/${session._id}/${action}`), {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${action} failed.`);
      setJobs(data.jobs || []);
      setStatusMessage(action === "search" ? "Search complete." : "Ranking refreshed.");
      await refreshSession(session._id);
      setActiveTab("jobs");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${action} failed.`);
    } finally {
      setIsBusy(false);
    }
  }

  async function prepareJob(jobId: string) {
    setIsBusy(true);
    setError("");
    try {
      await syncSessionFromForm();
      const response = await fetch(buildApiUrl(`/api/auto-apply/job/${jobId}/prepare`), { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to prepare application.");
      setSelectedJobId(jobId);
      setStatusMessage("Application draft ready for review.");
      await refreshSession();
      setActiveTab("apply");
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Unable to prepare application.");
    } finally {
      setIsBusy(false);
    }
  }

  async function askAnswer() {
    if (!selectedJob || !question.trim()) return;
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/auto-apply/job/${selectedJob._id}/answer`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to answer question.");
      setUserAnswer(data.answer?.answer || "");
      setStatusMessage(data.answer?.requiresUserReview ? "User review required." : "Answer generated.");
      await refreshSession();
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : "Unable to answer question.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveAnswer() {
    if (!session || !question.trim() || !userAnswer.trim()) return;
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/auto-apply/session/${session._id}/save-answer`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionPattern: question,
          answer: userAnswer,
          scope: saveReusable ? "reusable_profile" : "session",
          explicitReusableConsent: saveReusable,
          provenance: ["User clarification modal"],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save answer.");
      setStatusMessage(saveReusable ? "Saved to reusable profile memory." : "Saved for this session.");
      await refreshSession();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save answer.");
    } finally {
      setIsBusy(false);
    }
  }

  async function loadReview() {
    if (!selectedDraft) return;
    const response = await fetch(buildApiUrl(`/api/auto-apply/application/${selectedDraft._id}/review`), {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load review.");
      return;
    }
    setReview(data.review);
  }

  async function submitDraft() {
    if (!selectedDraft) return;
    const confirmed = window.confirm("Submit this application now? This action requires your explicit confirmation.");
    if (!confirmed) return;
    const response = await fetch(buildApiUrl(`/api/auto-apply/application/${selectedDraft._id}/submit`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSubmit: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Submission blocked.");
      return;
    }
    setStatusMessage("Application marked submitted.");
    await refreshSession();
  }

  function toggleSource(source: SearchSource) {
    setForm((current) => ({
      ...current,
      selectedSources: current.selectedSources.includes(source)
        ? current.selectedSources.filter((item) => item !== source)
        : [...current.selectedSources, source],
    }));
  }

  function toggleGroundTruth(id: string) {
    setForm((current) => ({
      ...current,
      selectedGroundTruthIds: current.selectedGroundTruthIds.includes(id)
        ? current.selectedGroundTruthIds.filter((item) => item !== id)
        : [...current.selectedGroundTruthIds, id],
    }));
  }

  return (
    <main className="page-shell space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.35fr)_360px]">
        <GlassPanel strong className="p-5 xl:col-span-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="section-kicker">Application assistant</p>
              <h1 className="text-foreground font-display text-4xl sm:text-5xl">Auto Apply</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-7">
                Search, prepare, and complete job applications with AI guidance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="surface-subtle inline-flex rounded-full p-1">
                {[
                  ["ai_coaching", "AI Coaching"],
                  ["manual_curate", "Manual Curate"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, mode: value as Mode }))}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      form.mode === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="rounded-full border border-border/80 bg-[hsl(var(--surface-2)/0.78)] px-4 py-2 text-sm font-medium text-foreground">
                {session?.status || "idle"}
              </span>
            </div>
          </div>
        </GlassPanel>

        <div className="grid grid-cols-4 gap-2 xl:hidden">
          {(["prompt", "jobs", "apply", "activity"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold capitalize ${
                activeTab === tab
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border/80 text-muted-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <GlassPanel className={`${activeTab === "prompt" ? "block" : "hidden"} p-5 xl:block`}>
          <form onSubmit={createSession} className="space-y-5">
            <SectionHeading title="Prompt" description="Define the roles, constraints, and evidence for this session." />
            <textarea
              value={form.prompt}
              onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
              className="input-premium min-h-32 resize-y"
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                className="input-premium"
                placeholder="Preferred location"
              />
              <input
                value={form.seniority}
                onChange={(event) => setForm((current) => ({ ...current, seniority: event.target.value }))}
                className="input-premium"
                placeholder="Seniority"
              />
              <select
                value={form.workplaceMode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, workplaceMode: event.target.value as WorkplaceMode }))
                }
                className="input-premium"
              >
                {WORKPLACE_MODE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{workplaceLabels[option]}</option>
                ))}
              </select>
              <select
                value={form.employmentType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, employmentType: event.target.value as EmploymentType }))
                }
                className="input-premium"
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{employmentLabels[option]}</option>
                ))}
              </select>
              <input
                value={form.salaryMin}
                onChange={(event) => setForm((current) => ({ ...current, salaryMin: event.target.value }))}
                className="input-premium"
                placeholder="Salary min"
              />
              <input
                value={form.salaryMax}
                onChange={(event) => setForm((current) => ({ ...current, salaryMax: event.target.value }))}
                className="input-premium"
                placeholder="Salary max"
              />
            </div>
            <input
              value={form.mustHaveKeywords}
              onChange={(event) => setForm((current) => ({ ...current, mustHaveKeywords: event.target.value }))}
              className="input-premium"
              placeholder="Must-have keywords"
            />
            <input
              value={form.excludeKeywords}
              onChange={(event) => setForm((current) => ({ ...current, excludeKeywords: event.target.value }))}
              className="input-premium"
              placeholder="Exclude keywords"
            />
            <input
              value={form.companyBlacklist}
              onChange={(event) => setForm((current) => ({ ...current, companyBlacklist: event.target.value }))}
              className="input-premium"
              placeholder="Company blacklist"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {SEARCH_SOURCES.map((source) => (
                <label key={source} className="surface-subtle flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.selectedSources.includes(source)}
                    onChange={() => toggleSource(source)}
                  />
                  <span>{SOURCE_LABELS[source]}</span>
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  Ground truth
                </p>
                <button
                  type="button"
                  onClick={() => setShowGroundTruthSelection((current) => !current)}
                  className="text-sm font-medium text-sky-300 underline-offset-4 hover:underline dark:text-sky-200"
                >
                  {showGroundTruthSelection ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                The agent starts from your profile and lets you refine which experiences, projects, and facts are available for this session.
              </p>
              {showGroundTruthSelection ? (
                <div className="space-y-4">
                  <label className="surface-subtle flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowFullResumeContext}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, allowFullResumeContext: event.target.checked }))
                      }
                    />
                    <span>Allow full resume context</span>
                  </label>

                  <div className="space-y-3">
                    <div className="rounded-2xl border border-border/70 bg-[hsl(var(--surface-1)/0.62)] p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Experiences
                      </div>
                      <div className="space-y-2">
                        {groundTruthSections.experiences.length ? (
                          groundTruthSections.experiences.map((item) => (
                            <label key={item.id} className="surface-subtle flex gap-3 rounded-2xl p-3 text-sm">
                              <input
                                type="checkbox"
                                checked={form.selectedGroundTruthIds.includes(item.id)}
                                onChange={() => toggleGroundTruth(item.id)}
                                className="mt-1"
                              />
                              <span>
                                <span className="block font-medium text-foreground">{item.label}</span>
                                {item.detail ? (
                                  <span className="text-muted-foreground line-clamp-2 text-xs leading-5">{item.detail}</span>
                                ) : null}
                              </span>
                            </label>
                          ))
                        ) : (
                          <div className="text-xs text-muted-foreground">No experiences found in profile.</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-[hsl(var(--surface-1)/0.62)] p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Projects
                      </div>
                      <div className="space-y-2">
                        {groundTruthSections.projects.length ? (
                          groundTruthSections.projects.map((item) => (
                            <label key={item.id} className="surface-subtle flex gap-3 rounded-2xl p-3 text-sm">
                              <input
                                type="checkbox"
                                checked={form.selectedGroundTruthIds.includes(item.id)}
                                onChange={() => toggleGroundTruth(item.id)}
                                className="mt-1"
                              />
                              <span>
                                <span className="block font-medium text-foreground">{item.label}</span>
                                {item.detail ? (
                                  <span className="text-muted-foreground line-clamp-2 text-xs leading-5">{item.detail}</span>
                                ) : null}
                              </span>
                            </label>
                          ))
                        ) : (
                          <div className="text-xs text-muted-foreground">No projects found in profile.</div>
                        )}
                      </div>
                    </div>

                    {groundTruthSections.profileFacts.length ? (
                      <div className="rounded-2xl border border-border/70 bg-[hsl(var(--surface-1)/0.62)] p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Profile facts
                        </div>
                        <div className="space-y-2">
                          {groundTruthSections.profileFacts.map((item) => (
                            <label key={item.id} className="surface-subtle flex gap-3 rounded-2xl p-3 text-sm">
                              <input
                                type="checkbox"
                                checked={form.selectedGroundTruthIds.includes(item.id)}
                                onChange={() => toggleGroundTruth(item.id)}
                                className="mt-1"
                              />
                              <span>
                                <span className="block font-medium text-foreground">{item.label}</span>
                                {item.detail ? (
                                  <span className="text-muted-foreground line-clamp-2 text-xs leading-5">{item.detail}</span>
                                ) : null}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="surface-subtle rounded-2xl px-3 py-2 text-sm text-muted-foreground">
                  Ground truth selection hidden. {form.selectedGroundTruthIds.length} item(s) selected.
                </div>
              )}
            </div>
            <button disabled={isBusy} className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              Start session
            </button>
          </form>
        </GlassPanel>

        <GlassPanel className={`${activeTab === "jobs" ? "block" : "hidden"} p-5 xl:block`}>
          <SectionHeading
            title="Jobs"
            description="Ranked candidates with fit evidence, missing requirements, and compliance fallbacks."
            action={
              <div className="flex gap-2">
                <button
                  disabled={!session || isBusy}
                  onClick={() => void runSessionAction("search")}
                  className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Search
                </button>
                <button
                  disabled={!session || isBusy}
                  onClick={() => void runSessionAction("rank")}
                  className="rounded-2xl border border-border/80 px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
                >
                  Rank
                </button>
              </div>
            }
          />
          <div className="mt-5 space-y-3">
            {jobs.length ? (
              jobs.map((job) => (
                <button
                  key={job._id}
                  type="button"
                  onClick={() => setSelectedJobId(job._id)}
                  className={`interactive-card w-full space-y-3 ${selectedJob?._id === job._id ? "border-primary/50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-left text-base font-semibold text-foreground">{job.title}</div>
                      <div className="text-left text-sm text-muted-foreground">
                        {job.company} · {job.location} · {SOURCE_LABELS[job.source] || job.source}
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-foreground">
                      {job.fitScore}
                    </span>
                  </div>
                  <p className="text-left text-sm leading-6 text-muted-foreground">{job.applicationStrategy}</p>
                  <div className="flex flex-wrap gap-2">
                    {job.riskFlags.map((flag) => (
                      <span key={flag} className="rounded-full border border-amber-400/30 px-2 py-1 text-xs text-amber-700 dark:text-amber-100">
                        {flag}
                      </span>
                    ))}
                    {job.missingRequirements.map((missing) => (
                      <span key={missing} className="rounded-full border border-rose-400/30 px-2 py-1 text-xs text-rose-700 dark:text-rose-100">
                        missing {missing}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-border/80 px-3 py-1 text-xs text-muted-foreground">{job.status}</span>
                    <span className="rounded-full border border-border/80 px-3 py-1 text-xs text-muted-foreground">Save job</span>
                    <span className="rounded-full border border-border/80 px-3 py-1 text-xs text-muted-foreground">Skip</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="surface-subtle rounded-2xl p-5 text-sm text-muted-foreground">No ranked jobs yet.</div>
            )}
          </div>
        </GlassPanel>

        <GlassPanel className={`${activeTab === "apply" ? "block" : "hidden"} p-5 xl:block`}>
          <SectionHeading title="Apply" description="Uploads, browser preview, draft answers, and final review." />
          <div className="mt-5 space-y-4">
            <div className="grid gap-3">
              <label className="surface-subtle rounded-2xl p-3 text-sm">
                <span className="mb-2 block font-medium text-foreground">Resume</span>
                <input type="file" onChange={(event) => void uploadFile("resume", event.target.files?.[0])} />
              </label>
              <label className="surface-subtle rounded-2xl p-3 text-sm">
                <span className="mb-2 block font-medium text-foreground">Supporting document</span>
                <input type="file" onChange={(event) => void uploadFile("document", event.target.files?.[0])} />
              </label>
            </div>

            {selectedJob ? (
              <div className="interactive-card space-y-3">
                <div className="text-sm font-semibold text-foreground">{selectedJob.title}</div>
                <p className="text-sm leading-6 text-muted-foreground">{selectedJob.fitReasons.join(" ")}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void prepareJob(selectedJob._id)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                    Prepare application
                  </button>
                  {selectedJob.applyUrl ? (
                    <a href={selectedJob.applyUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-border/80 px-4 py-2 text-sm font-semibold text-foreground">
                      Open source
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="surface-subtle min-h-40 rounded-2xl p-4">
              <div className="mb-2 text-sm font-semibold text-foreground">Browser preview</div>
              <div className="grid h-28 place-items-center rounded-xl border border-dashed border-border/80 text-sm text-muted-foreground">
                Visible browser assistance appears here when enabled.
              </div>
            </div>

            <div className="space-y-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="input-premium min-h-20"
                placeholder="Employer question detected"
              />
              <button onClick={() => void askAnswer()} className="rounded-2xl border border-border/80 px-4 py-2 text-sm font-semibold text-foreground">
                Draft answer
              </button>
              <textarea
                value={userAnswer}
                onChange={(event) => setUserAnswer(event.target.value)}
                className="input-premium min-h-24"
                placeholder="Draft or user-provided answer"
              />
              <label className="surface-subtle flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                <input type="checkbox" checked={saveReusable} onChange={(event) => setSaveReusable(event.target.checked)} />
                <span>Save to reusable profile memory</span>
              </label>
              <button onClick={() => void saveAnswer()} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Save answer
              </button>
            </div>

            {selectedDraft ? (
              <div className="interactive-card space-y-3">
                <div className="text-sm font-semibold text-foreground">Final review</div>
                <p className="text-sm leading-6 text-muted-foreground">{selectedDraft.generatedApplicationSummary}</p>
                {selectedDraft.coverLetterText ? (
                  <textarea readOnly value={selectedDraft.coverLetterText} className="input-premium min-h-40" />
                ) : null}
                <div className="flex gap-2">
                  <button onClick={() => void loadReview()} className="rounded-2xl border border-border/80 px-4 py-2 text-sm font-semibold text-foreground">
                    Review package
                  </button>
                  <button onClick={() => void submitDraft()} className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
                    Submit application
                  </button>
                </div>
                {review ? (
                  <pre className="max-h-64 overflow-auto rounded-2xl bg-black/20 p-3 text-xs text-muted-foreground">
                    {JSON.stringify(review, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        <GlassPanel className={`${activeTab === "activity" ? "block" : "hidden"} p-5 xl:block`}>
          <SectionHeading title="Activity" description="Session events, intervention queue, and history." />
          <div className="mt-5 space-y-4">
            <div className="surface-subtle rounded-2xl p-4 text-sm text-foreground">{statusMessage}</div>
            {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-700 dark:text-rose-100">{error}</div> : null}
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event._id} className="surface-subtle rounded-2xl p-3">
                  <div className="text-sm font-medium text-foreground">{event.message}</div>
                  <div className="text-xs text-muted-foreground">{event.type}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-foreground">Session history</div>
              <div className="space-y-2">
                {sessions.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => {
                      setSession(item);
                      void refreshSession(item._id);
                    }}
                    className="surface-subtle w-full rounded-2xl p-3 text-left text-sm"
                  >
                    <span className="block font-medium text-foreground">{item.prompt}</span>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </GlassPanel>
      </section>
    </main>
  );
}
