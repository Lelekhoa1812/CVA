"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GlassPanel from "@/components/ui/GlassPanel";
import ModuleShell from "@/components/ui/ModuleShell";
import SectionHeading from "@/components/ui/SectionHeading";
import { buildApiUrl } from "@/lib/api";
import type { UserContextSnapshot } from "@/lib/career/types";

type OverviewResponse = {
  context: UserContextSnapshot;
  summary: {
    activeCampaigns: number;
    leadCount: number;
    prioritizedCount: number;
    tailoredCount: number;
    artifactCount: number;
  };
  pipelineCounts: Array<{ state: string; count: number }>;
  blockerHeatmap: Array<{ label: string; count: number }>;
  recommendations: Array<{ title: string; body: string; tone: string }>;
  campaigns: Array<{
    _id?: string;
    status: string;
    query?: { jobTitle?: string; location?: string };
    totalResults?: number;
    blockedSources?: string[];
    createdAt?: string;
  }>;
  leads: LeadRecord[];
};

type LeadRecord = {
  _id?: string;
  title: string;
  company: string;
  location: string;
  source: string;
  fitScore: number;
  recommendation: string;
  lifecycleState: string;
  liveStatus: string;
  remotePolicy: string;
  salaryText: string;
  extractedKeywords?: string[];
  listingUrl?: string;
  applicationUrl?: string;
  updatedAt?: string;
};

type LeadDetailResponse = {
  lead: LeadRecord & {
    canonicalJobDescription?: string;
    companySignals?: string[];
    employmentType?: string;
  };
  evaluation?: {
    fitScore: number;
    recommendation: string;
    reasoningSummary: string;
    nextActions: string[];
    dimensionScores: Array<{ key: string; label: string; score: number; reason: string }>;
    gapMap: Array<{ title: string; severity: string; detail: string; mitigation: string }>;
    matchedRequirements: Array<{
      requirement: string;
      coverage: string;
      matchedFacts: string[];
    }>;
  } | null;
  tailoringRun?: {
    atsValidation?: {
      passed: boolean;
      keywordCoverage: number;
      supportedClaims: number;
      unsupportedClaims: number;
      warnings: string[];
      missingKeywords: string[];
    };
    evidenceSet?: Array<{
      type: string;
      title: string;
      score: number;
      matchedKeywords: string[];
      rewrittenContent: string;
    }>;
    resumeDraft?: {
      headline?: string;
      summary?: string;
      competencies?: string[];
      skills?: string[];
      requirementCoverage?: Array<{
        requirement: string;
        coverage: string;
        matchedFacts: string[];
      }>;
    };
  } | null;
  artifacts: Array<{
    _id?: string;
    artifactType: string;
    variant: string;
    mimeType: string;
    body: string;
    summary: string;
  }>;
  events: Array<{
    _id?: string;
    type: string;
    createdAt?: string;
    payload?: Record<string, unknown>;
  }>;
};

type ContextFormState = {
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

const EMPTY_CONTEXT_FORM: ContextFormState = {
  scoreFloor: "65",
  salaryFloor: "0",
  targetMin: "0",
  targetMax: "0",
  jobTitles: "",
  locations: "",
  preferredLocations: "",
  avoidLocations: "",
  remoteOnly: false,
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getLeadId(lead?: { _id?: string }) {
  return lead?._id || "";
}

function formatDate(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Just now";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toneClasses(tone: string) {
  if (tone === "positive") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
  if (tone === "warning") return "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-100";
  return "border-border/80 bg-[hsl(var(--surface-1)/0.82)] text-muted-foreground";
}

function recommendationClasses(recommendation: string) {
  if (recommendation === "prioritize") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
  if (recommendation === "skip") return "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-100";
  return "border-sky-300/30 bg-sky-300/10 text-sky-700 dark:text-sky-100";
}

function coverageClasses(coverage: string) {
  if (coverage === "covered") return "text-emerald-700 dark:text-emerald-100";
  if (coverage === "partial") return "text-amber-700 dark:text-amber-100";
  return "text-rose-700 dark:text-rose-100";
}

function isApiError(value: unknown): value is { error?: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function createContextForm(context: UserContextSnapshot): ContextFormState {
  return {
    scoreFloor: String(context.scoreFloor || 65),
    salaryFloor: String(context.compensation.salaryFloor || 0),
    targetMin: String(context.compensation.targetMin || 0),
    targetMax: String(context.compensation.targetMax || 0),
    jobTitles: context.searchPreferences.jobTitles.join(", "),
    locations: context.searchPreferences.locations.join(", "),
    preferredLocations: context.workPreferences.preferredLocations.join(", "),
    avoidLocations: context.workPreferences.avoidLocations.join(", "),
    remoteOnly: Boolean(context.workPreferences.remoteOnly || context.searchPreferences.remoteOnly),
  };
}

export default function ControlRoomPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<LeadDetailResponse | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("executive");
  const [contextForm, setContextForm] = useState<ContextFormState>(EMPTY_CONTEXT_FORM);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading your career operating system.");

  const loadLead = useCallback(async (leadId: string) => {
    if (!leadId) {
      setDetail(null);
      return;
    }

    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/control-room/leads/${leadId}`), {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as LeadDetailResponse | { error?: string } | null;

      if (!response.ok || !data || isApiError(data)) {
        throw new Error((isApiError(data) && data.error) || "Unable to load lead details.");
      }

      setDetail(data);
      const firstHtmlVariant = data.artifacts.find((artifact) => artifact.artifactType === "resume_html")?.variant;
      if (firstHtmlVariant) {
        setSelectedVariant(firstHtmlVariant);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load lead details.");
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const loadOverview = useCallback(async (preferredLeadId?: string) => {
    setIsLoadingOverview(true);

    try {
      const response = await fetch(buildApiUrl("/api/control-room/overview"), {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as OverviewResponse | { error?: string } | null;

      if (!response.ok || !data || isApiError(data)) {
        throw new Error((isApiError(data) && data.error) || "Unable to load the control room.");
      }

      setOverview(data);
      setContextForm(createContextForm(data.context));

      const nextLeadId =
        preferredLeadId && data.leads.some((lead) => getLeadId(lead) === preferredLeadId)
          ? preferredLeadId
          : getLeadId(data.leads[0]);

      setSelectedLeadId(nextLeadId);
      setStatusMessage(
        data.summary.leadCount
          ? `Loaded ${data.summary.leadCount} persistent leads and ${data.summary.artifactCount} generated artifacts.`
          : "No saved leads yet. Run a job search to seed the control room.",
      );

      if (nextLeadId) {
        await loadLead(nextLeadId);
      } else {
        setDetail(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the control room.");
    } finally {
      setIsLoadingOverview(false);
    }
  }, [loadLead]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const artifactPreview = useMemo(() => {
    if (!detail) return null;
    return (
      detail.artifacts.find(
        (artifact) => artifact.artifactType === "resume_html" && artifact.variant === selectedVariant,
      ) || detail.artifacts.find((artifact) => artifact.artifactType === "resume_html") || null
    );
  }, [detail, selectedVariant]);

  async function saveContext() {
    setIsSavingContext(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl("/api/control-room/context"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreFloor: Number(contextForm.scoreFloor) || 0,
          compensation: {
            currency: overview?.context.compensation.currency || "AUD",
            salaryFloor: Number(contextForm.salaryFloor) || 0,
            targetMin: Number(contextForm.targetMin) || 0,
            targetMax: Number(contextForm.targetMax) || 0,
          },
          searchPreferences: {
            jobTitles: splitCsv(contextForm.jobTitles),
            locations: splitCsv(contextForm.locations),
            sources: overview?.context.searchPreferences.sources || [],
            remoteOnly: contextForm.remoteOnly,
          },
          workPreferences: {
            modes: contextForm.remoteOnly ? ["remote"] : overview?.context.workPreferences.modes || ["remote", "hybrid"],
            preferredLocations: splitCsv(contextForm.preferredLocations),
            avoidLocations: splitCsv(contextForm.avoidLocations),
            visaStatus: overview?.context.workPreferences.visaStatus || "",
            remoteOnly: contextForm.remoteOnly,
          },
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { context: UserContextSnapshot }
        | { error?: string }
        | null;

      if (!response.ok || !data || isApiError(data)) {
        throw new Error((isApiError(data) && data.error) || "Unable to save context.");
      }

      setContextForm(createContextForm(data.context));
      setStatusMessage("Strategist context updated. Future fit scores will use the new floor and preferences.");
      await loadOverview(selectedLeadId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save context.");
    } finally {
      setIsSavingContext(false);
    }
  }

  async function runWorkflow() {
    if (!selectedLeadId) return;

    setIsRunningWorkflow(true);
    setError(null);
    setStatusMessage("Running Market Analyst, Career Strategist, and Resume Specialist.");

    try {
      const response = await fetch(buildApiUrl(`/api/control-room/leads/${selectedLeadId}/orchestrate`), {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as LeadDetailResponse | { error?: string } | null;

      if (!response.ok || !data || isApiError(data)) {
        throw new Error((isApiError(data) && data.error) || "Unable to orchestrate this lead.");
      }

      setDetail(data);
      setStatusMessage("Workflow complete. The tailored draft, ATS report, and semantic variants are ready.");
      await loadOverview(selectedLeadId);
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : "Unable to orchestrate this lead.");
    } finally {
      setIsRunningWorkflow(false);
    }
  }

  return (
    <ModuleShell
      eyebrow="Control Room"
      title="Operate search, scoring, and tailoring from one persistent career system."
      description="Track campaigns, score lead quality, inspect evidence coverage, and export semantic resume variants from a single workflow-aware cockpit."
      stats={[
        { label: "Saved leads", value: `${overview?.summary.leadCount ?? 0}` },
        { label: "Prioritized", value: `${overview?.summary.prioritizedCount ?? 0}` },
        { label: "Artifacts", value: `${overview?.summary.artifactCount ?? 0}` },
      ]}
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="section-kicker">System State</p>
            <h2 className="text-foreground font-display text-3xl">Explainable by default.</h2>
            <p className="text-muted-foreground text-sm leading-7">
              Every lead carries liveness, fit reasoning, ATS coverage, and artifact lineage so the product can
              improve over time instead of regenerating from scratch on every click.
            </p>
          </div>

          <div className="space-y-3">
            {[
              statusMessage,
              "Persistent search campaigns and deduped leads",
              "Shared strategist memory and calibration controls",
              "Semantic resume variants with ATS validation",
            ].map((item) => (
              <div key={item} className="surface-subtle flex items-start gap-3 rounded-2xl px-4 py-3">
                <span className="status-dot mt-1" />
                <span className="text-foreground text-sm leading-6">{item}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {error ? (
        <GlassPanel className="border-rose-400/30 p-4">
          <p className="text-sm text-rose-700 dark:text-rose-100">{error}</p>
        </GlassPanel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="User Context"
            title="Tune the strategist"
            description="Set the score floor, compensation band, and search constraints that should govern fit recommendations."
            action={
              <button
                type="button"
                onClick={saveContext}
                className="button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingContext || isLoadingOverview}
              >
                {isSavingContext ? "Saving..." : "Save Context"}
              </button>
            }
          />

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Strategist score floor</span>
              <input
                className="input-premium"
                value={contextForm.scoreFloor}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, scoreFloor: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Salary floor</span>
              <input
                className="input-premium"
                value={contextForm.salaryFloor}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, salaryFloor: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Target salary minimum</span>
              <input
                className="input-premium"
                value={contextForm.targetMin}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, targetMin: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Target salary maximum</span>
              <input
                className="input-premium"
                value={contextForm.targetMax}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, targetMax: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-foreground text-sm font-medium">Target job titles</span>
              <input
                className="input-premium"
                value={contextForm.jobTitles}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, jobTitles: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Search locations</span>
              <input
                className="input-premium"
                value={contextForm.locations}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, locations: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Preferred locations</span>
              <input
                className="input-premium"
                value={contextForm.preferredLocations}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, preferredLocations: event.target.value }))
                }
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-foreground text-sm font-medium">Avoid locations</span>
              <input
                className="input-premium"
                value={contextForm.avoidLocations}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, avoidLocations: event.target.value }))
                }
              />
            </label>

            <label className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                checked={contextForm.remoteOnly}
                onChange={(event) =>
                  setContextForm((current) => ({ ...current, remoteOnly: event.target.checked }))
                }
              />
              <span className="text-sm text-foreground">Remote-only search and scoring mode</span>
            </label>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-7">
          <SectionHeading
            eyebrow="Strategist Notes"
            title="What the system is learning"
            description="Short recommendations derived from your live pipeline and evaluation history."
          />

          <div className="mt-6 space-y-3">
            {(overview?.recommendations || []).map((recommendation) => (
              <div
                key={recommendation.title}
                className={`rounded-2xl border px-4 py-4 ${toneClasses(recommendation.tone)}`}
              >
                <div className="text-sm font-semibold">{recommendation.title}</div>
                <p className="mt-2 text-sm leading-6">{recommendation.body}</p>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Pipeline"
            title="Persistent workflow stages"
            description="Searches now land in durable lifecycle states so orchestration can resume cleanly on later visits."
          />

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(overview?.pipelineCounts || []).map((item) => (
              <div key={item.state} className="surface-subtle rounded-[1.35rem] p-4">
                <div className="text-foreground text-2xl font-semibold">{item.count}</div>
                <div className="text-muted-foreground mt-1 text-xs uppercase tracking-[0.2em]">
                  {item.state.replace(/_/g, " ")}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <SectionHeading
              eyebrow="Campaign Memory"
              title="Recent searches"
              description="Each crawl is tracked with result counts and blocked-source context for later review."
            />

            <div className="mt-5 space-y-3">
              {(overview?.campaigns || []).map((campaign) => (
                <div key={campaign._id || `${campaign.query?.jobTitle}-${campaign.createdAt}`} className="surface-subtle rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-foreground font-medium">
                        {campaign.query?.jobTitle || "Untitled search"} • {campaign.query?.location || "Any location"}
                      </div>
                      <div className="text-muted-foreground mt-1 text-sm">
                        {campaign.totalResults || 0} results • {campaign.blockedSources?.length || 0} blocked sources
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                      {campaign.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6 sm:p-7">
          <SectionHeading
            eyebrow="Blockers"
            title="Gap heatmap"
            description="The most common reasons a lead gets held back before generation begins."
          />

          <div className="mt-6 space-y-3">
            {(overview?.blockerHeatmap || []).map((item) => (
              <div key={item.label} className="surface-subtle rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-foreground text-sm font-medium">{item.label}</span>
                  <span className="text-muted-foreground text-sm">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="Lead Intelligence"
          title="Review and orchestrate saved leads"
          description="Pick a lead to inspect fit reasoning, evidence coverage, ATS warnings, and generated variants."
          action={
            <button
              type="button"
              onClick={runWorkflow}
              className="button-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedLeadId || isRunningWorkflow || isLoadingDetail}
            >
              {isRunningWorkflow ? "Running Workflow..." : "Run Specialist Workflow"}
            </button>
          }
        />

        <div className="mt-8 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">
            {(overview?.leads || []).map((lead) => {
              const leadId = getLeadId(lead);
              const isSelected = selectedLeadId === leadId;
              return (
                <button
                  key={leadId || `${lead.title}-${lead.company}`}
                  type="button"
                  onClick={() => {
                    setSelectedLeadId(leadId);
                    void loadLead(leadId);
                  }}
                  className={`w-full rounded-[1.4rem] border p-4 text-left transition ${
                    isSelected
                      ? "border-primary/40 bg-[hsl(var(--surface-2)/0.96)]"
                      : "border-border/80 bg-[hsl(var(--surface-1)/0.78)] hover:border-primary/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-foreground font-medium">{lead.title}</div>
                      <div className="text-muted-foreground mt-1 text-sm">
                        {lead.company} • {lead.location || "Location TBD"}
                      </div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${recommendationClasses(lead.recommendation)}`}>
                      {lead.recommendation}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span>{lead.liveStatus}</span>
                    <span>{lead.lifecycleState.replace(/_/g, " ")}</span>
                    <span>{lead.source}</span>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fit score</span>
                    <span className="text-foreground font-semibold">{lead.fitScore || 0}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            {!selectedLeadId ? (
              <div className="surface-subtle rounded-[1.5rem] p-6 text-sm text-muted-foreground">
                Save some leads from Job Search to start using the control room.
              </div>
            ) : isLoadingDetail && !detail ? (
              <div className="surface-subtle rounded-[1.5rem] p-6 text-sm text-muted-foreground">
                Loading lead intelligence...
              </div>
            ) : detail ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="surface-subtle rounded-[1.5rem] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-foreground font-display text-3xl">{detail.lead.title}</h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-7">
                          {detail.lead.company} • {detail.lead.location || "Location TBD"} • {detail.lead.remotePolicy || "Work mode pending"}
                        </p>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${recommendationClasses(detail.lead.recommendation)}`}>
                        {detail.lead.recommendation}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Fit score", value: `${detail.lead.fitScore || 0}` },
                        { label: "Liveness", value: detail.lead.liveStatus || "unknown" },
                        { label: "Employment", value: detail.lead.employmentType || "TBD" },
                        { label: "Last update", value: formatDate(detail.lead.updatedAt) },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
                          <div className="text-foreground text-lg font-semibold">{item.value}</div>
                          <div className="text-muted-foreground mt-1 text-xs uppercase tracking-[0.22em]">
                            {item.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    {detail.evaluation?.reasoningSummary ? (
                      <p className="text-muted-foreground mt-5 text-sm leading-7">{detail.evaluation.reasoningSummary}</p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-3">
                      {detail.lead.applicationUrl ? (
                        <a
                          href={detail.lead.applicationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="button-secondary"
                        >
                          Open Apply URL
                        </a>
                      ) : null}
                      {detail.lead.listingUrl ? (
                        <a
                          href={detail.lead.listingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="button-secondary"
                        >
                          Open Listing
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="surface-subtle rounded-[1.5rem] p-5">
                    <div className="text-foreground text-sm font-semibold uppercase tracking-[0.18em]">
                      Dimension scores
                    </div>
                    <div className="mt-4 space-y-3">
                      {(detail.evaluation?.dimensionScores || []).map((dimension) => (
                        <div key={dimension.key} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-foreground text-sm font-medium">{dimension.label}</span>
                            <span className="text-foreground text-sm font-semibold">{dimension.score}</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-[hsl(var(--surface-3)/0.8)]">
                            <div
                              className="h-2 rounded-full bg-[linear-gradient(90deg,hsl(var(--accent)),hsl(var(--primary)))]"
                              style={{ width: `${Math.max(8, Math.min(100, dimension.score))}%` }}
                            />
                          </div>
                          <p className="text-muted-foreground mt-3 text-sm leading-6">{dimension.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="Coverage"
                      title="Requirement mapping"
                      description="See what the strategist believes is covered, partial, or still missing."
                    />
                    <div className="mt-6 space-y-3">
                      {(detail.evaluation?.matchedRequirements || detail.tailoringRun?.resumeDraft?.requirementCoverage || []).map((match) => (
                        <div key={match.requirement} className="surface-subtle rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-foreground font-medium">{match.requirement}</div>
                              <div className="text-muted-foreground mt-1 text-sm">
                                {match.matchedFacts.join(", ") || "No direct evidence connected yet"}
                              </div>
                            </div>
                            <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${coverageClasses(match.coverage)}`}>
                              {match.coverage}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="Gaps"
                      title="Blockers and mitigations"
                      description="The reasons a lead may need evidence work before application."
                    />
                    <div className="mt-6 space-y-3">
                      {(detail.evaluation?.gapMap || []).map((gap) => (
                        <div key={`${gap.title}-${gap.severity}`} className="surface-subtle rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-foreground font-medium">{gap.title}</div>
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {gap.severity}
                            </div>
                          </div>
                          <p className="text-muted-foreground mt-2 text-sm leading-6">{gap.detail}</p>
                          <p className="text-foreground mt-3 text-sm leading-6">{gap.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="Resume Specialist"
                      title="Evidence set and ATS report"
                      description="Selected proof points are preserved as durable tailoring input instead of route-local prompt state."
                    />

                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {(detail.tailoringRun?.evidenceSet || []).map((item) => (
                        <div key={`${item.type}-${item.title}`} className="surface-subtle rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-foreground font-medium">{item.title}</div>
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {Math.round(item.score)}
                            </div>
                          </div>
                          <div className="text-muted-foreground mt-2 text-sm">
                            {(item.matchedKeywords || []).join(", ") || "Keyword mapping pending"}
                          </div>
                          <p className="text-muted-foreground mt-3 text-sm leading-6 whitespace-pre-wrap">
                            {item.rewrittenContent}
                          </p>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="ATS"
                      title="Validation"
                      description="Hard guardrails keep unsupported claims and weak coverage visible."
                    />

                    {detail.tailoringRun?.atsValidation ? (
                      <div className="mt-6 space-y-3">
                        {[
                          {
                            label: "Keyword coverage",
                            value: `${detail.tailoringRun.atsValidation.keywordCoverage}%`,
                          },
                          {
                            label: "Supported claims",
                            value: `${detail.tailoringRun.atsValidation.supportedClaims}`,
                          },
                          {
                            label: "Unsupported claims",
                            value: `${detail.tailoringRun.atsValidation.unsupportedClaims}`,
                          },
                          {
                            label: "Status",
                            value: detail.tailoringRun.atsValidation.passed ? "Passed" : "Needs work",
                          },
                        ].map((item) => (
                          <div key={item.label} className="surface-subtle rounded-2xl p-4">
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                              {item.label}
                            </div>
                            <div className="text-foreground mt-2 text-lg font-semibold">{item.value}</div>
                          </div>
                        ))}

                        {(detail.tailoringRun.atsValidation.warnings || []).map((warning) => (
                          <div key={warning} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-sm text-amber-800 dark:text-amber-100">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-6 surface-subtle rounded-2xl p-4 text-sm text-muted-foreground">
                        Run the specialist workflow to generate an ATS report.
                      </div>
                    )}
                  </GlassPanel>
                </div>

                <GlassPanel className="p-6">
                  <SectionHeading
                    eyebrow="Artifacts"
                    title="Semantic preview and lineage"
                    description="HTML variants are generated from the same resume draft used for validation so preview and export stay aligned."
                  />

                  <div className="mt-6 flex flex-wrap gap-3">
                    {detail.artifacts
                      .filter((artifact) => artifact.artifactType === "resume_html")
                      .map((artifact) => (
                        <button
                          key={`${artifact.artifactType}-${artifact.variant}`}
                          type="button"
                          onClick={() => setSelectedVariant(artifact.variant)}
                          className={
                            artifact.variant === selectedVariant
                              ? "button-primary"
                              : "button-secondary"
                          }
                        >
                          {artifact.variant}
                        </button>
                      ))}
                  </div>

                  {artifactPreview ? (
                    <div className="mt-6 overflow-hidden rounded-[1.6rem] border border-border/80 bg-background">
                      <iframe
                        title={`${artifactPreview.variant} preview`}
                        srcDoc={artifactPreview.body}
                        className="h-[720px] w-full"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="mt-6 surface-subtle rounded-[1.5rem] p-5 text-sm text-muted-foreground">
                      Run the workflow to render semantic preview variants.
                    </div>
                  )}
                </GlassPanel>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="Draft"
                      title="Source-of-truth summary"
                      description="The semantic draft stays available for future template engines and diffing."
                    />
                    <div className="mt-6 surface-subtle rounded-[1.5rem] p-5">
                      <div className="text-foreground text-xl font-semibold">
                        {detail.tailoringRun?.resumeDraft?.headline || "Draft pending"}
                      </div>
                      <p className="text-muted-foreground mt-3 text-sm leading-7">
                        {detail.tailoringRun?.resumeDraft?.summary || "Run the workflow to build the semantic resume draft."}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {(detail.tailoringRun?.resumeDraft?.competencies || []).map((competency) => (
                          <span key={competency} className="rounded-full bg-[hsl(var(--surface-2)/0.94)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                            {competency}
                          </span>
                        ))}
                      </div>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-6">
                    <SectionHeading
                      eyebrow="Events"
                      title="Workflow history"
                      description="Every major state transition is tracked so the system can explain what happened."
                    />
                    <div className="mt-6 space-y-3">
                      {(detail.events || []).map((event) => (
                        <div key={`${event.type}-${event.createdAt}`} className="surface-subtle rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-foreground text-sm font-medium">{event.type.replace(/_/g, " ")}</div>
                            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {formatDate(event.createdAt)}
                            </div>
                          </div>
                          {event.payload ? (
                            <pre className="text-muted-foreground mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>
              </>
            ) : (
              <div className="surface-subtle rounded-[1.5rem] p-6 text-sm text-muted-foreground">
                {isLoadingOverview ? "Loading your saved leads..." : "Select a lead to inspect strategist output."}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>
    </ModuleShell>
  );
}
