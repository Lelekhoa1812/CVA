"use client";

import { FormEvent, startTransition, useEffect, useRef, useState } from "react";
import GlassPanel from "@/components/ui/GlassPanel";
import ModuleShell from "@/components/ui/ModuleShell";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";
import { defaultSearchRequest } from "@/lib/search/schema";
import { buildApiUrl } from "@/lib/api";
import { passesPostFilters } from "@/lib/search/filters";
import {
  createInitialSourceProgress,
  EMPLOYMENT_TYPE_OPTIONS,
  MAX_RESULTS_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  SEARCH_SOURCES,
  SOURCE_LABELS,
  type EmploymentType,
  type JobSearchResult,
  type PostedWithin,
  type SearchFilters,
  type SearchRequest,
  type SearchSource,
  type SearchStreamEvent,
  type SourceProgressState,
  type WorkplaceMode,
  WORKPLACE_MODE_OPTIONS,
} from "@/lib/search/types";

type CompletionSummary = {
  totalResults: number;
  blockedSources: SearchSource[];
  elapsedMs: number;
};

const postedLabels: Record<(typeof POSTED_WITHIN_OPTIONS)[number], string> = {
  any: "Any time",
  "24h": "Past 24 hours",
  "3d": "Past 3 days",
  "7d": "Past 7 days",
  "14d": "Past 14 days",
  "30d": "Past 30 days",
};

const workplaceLabels: Record<(typeof WORKPLACE_MODE_OPTIONS)[number], string> = {
  any: "Any workplace",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const employmentLabels: Record<(typeof EMPLOYMENT_TYPE_OPTIONS)[number], string> = {
  any: "Any employment type",
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
};

const MATCH_FILTER_OPTIONS = ["any", "strong", "partial"] as const;
type MatchFilter = (typeof MATCH_FILTER_OPTIONS)[number];
const matchLabels: Record<MatchFilter, string> = {
  any: "Any match",
  strong: "Strong matches only",
  partial: "Partial matches only",
};

type PlatformFilter = SearchSource | "any";
const PLATFORM_FILTER_OPTIONS: PlatformFilter[] = ["any", ...SEARCH_SOURCES];
const platformLabels: Record<PlatformFilter, string> = {
  any: "Any platform",
  ...SOURCE_LABELS,
};

type ResultFilters = {
  match: MatchFilter;
  platform: PlatformFilter;
  postedWithin: PostedWithin;
  workplaceMode: WorkplaceMode;
  employmentType: EmploymentType;
};

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

function statusClasses(status: SourceProgressState["status"]) {
  if (status === "complete") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
  if (status === "blocked") return "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-100";
  if (status === "error") return "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-100";
  if (status === "running") return "border-sky-300/30 bg-sky-300/10 text-sky-700 dark:text-sky-100";
  return "border-border/80 bg-[hsl(var(--surface-1)/0.78)] text-muted-foreground";
}

export default function SearchPage() {
  const [form, setForm] = useState<SearchRequest>(defaultSearchRequest);
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [sourceProgress, setSourceProgress] = useState(createInitialSourceProgress());
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready to scan public job sources.");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [runSources, setRunSources] = useState<SearchSource[]>([...SEARCH_SOURCES]);
  const [resultFilters, setResultFilters] = useState<ResultFilters>({
    match: "any",
    platform: "any",
    postedWithin: "any",
    workplaceMode: "any",
    employmentType: "any",
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleEvent(event: SearchStreamEvent) {
    if (event.type === "status") {
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "source-progress") {
      setSourceProgress((current) => ({
        ...current,
        [event.source]: {
          source: event.source,
          status: event.status,
          pagesScanned: event.pagesScanned,
          resultsFound: event.resultsFound,
          message: event.message || current[event.source].message,
          blockedReason: event.blockedReason,
        },
      }));
      return;
    }

    if (event.type === "result") {
      startTransition(() => {
        setResults((current) => {
          if (current.some((item) => item.id === event.result.id)) {
            return current;
          }
          return [...current, event.result];
        });
      });
      return;
    }

    if (event.type === "complete") {
      setSummary({
        totalResults: event.totalResults,
        blockedSources: event.blockedSources,
        elapsedMs: event.elapsedMs,
      });
      setStatusMessage(
        event.totalResults
          ? `Search finished with ${event.totalResults} deduped matches.`
          : "Search finished without any matching jobs.",
      );
      return;
    }

    if (event.type === "error") {
      setError(event.message);
      if (event.fatal) {
        setStatusMessage("The search ended early because the worker failed.");
      }
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setSourceProgress(createInitialSourceProgress());
    setStatusMessage("Preparing the hybrid crawl.");
    setRunSources(form.selectedSources);

    try {
      // Motivation vs Logic:
      // Motivation: This feature needs to feel live while the crawler moves through multiple sources, blocked-source
      // fallbacks, and detail pages that can take noticeably longer than a normal form submit.
      // Logic: Stream NDJSON from the backend and fold each event into local UI state so the user sees per-source
      // progress, partial results, and cancellation feedback without waiting for the full crawl to complete.
      const response = await fetch(buildApiUrl("/api/search/jobs/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start the job search.");
      }

      if (!response.body) {
        throw new Error("The search stream did not return a body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            handleEvent(JSON.parse(line) as SearchStreamEvent);
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        handleEvent(JSON.parse(trailing) as SearchStreamEvent);
      }
    } catch (searchError) {
      if (controller.signal.aborted) {
        setStatusMessage("Search canceled. Partial results are still available below.");
      } else {
        const message =
          searchError instanceof Error ? searchError.message : "Search failed unexpectedly.";
        setError(message);
        setStatusMessage("The search could not complete.");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsSearching(false);
    }
  }

  function cancelSearch() {
    abortRef.current?.abort();
  }

  function toggleAllSources(checked: boolean) {
    setForm((current) => ({
      ...current,
      selectedSources: checked ? [...SEARCH_SOURCES] : [],
    }));
  }

  function toggleSource(source: SearchSource, checked: boolean) {
    setForm((current) => ({
      ...current,
      selectedSources: checked
        ? SEARCH_SOURCES.filter((item) => item === source || current.selectedSources.includes(item))
        : current.selectedSources.filter((item) => item !== source),
    }));
  }

  function resetSearch() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSearching(false);
    setError(null);
    setResults([]);
    setSummary(null);
    setSourceProgress(createInitialSourceProgress());
    setStatusMessage("Ready to scan public job sources.");
  }

  // Motivation vs Logic:
  // Motivation: The user-facing filter includes an "All platforms" shortcut, but the backend contract should stay a
  // plain list of concrete sources so the route and crawler do not need UI-specific translation rules.
  // Logic: Store only selected source ids in form state, then derive the "all" view state and visible source cards
  // from that array for both the pre-run brief and the live progress panel.
  const selectedAllSources = form.selectedSources.length === SEARCH_SOURCES.length;
  const visibleSources =
    (isSearching || summary ? runSources : form.selectedSources).length > 0
      ? isSearching || summary
        ? runSources
        : form.selectedSources
      : SEARCH_SOURCES;
  const blockedCount = visibleSources.filter((source) => sourceProgress[source].status === "blocked").length;
  const searchFilters: SearchFilters = {
    postedWithin: resultFilters.postedWithin,
    workplaceMode: resultFilters.workplaceMode,
    employmentType: resultFilters.employmentType,
  };
  // Motivation vs Logic:
  // Motivation: Result cards should be fine-grained so readers can dial in a subset of matches without re-running the crawl.
  // Logic: Track dedicated UI filters and reuse the server heuristics to drop cards before we render them.
  const filteredResults = results.filter((result) => {
    if (resultFilters.match !== "any" && result.searchQueryMatch !== resultFilters.match) {
      return false;
    }
    if (resultFilters.platform !== "any" && result.source !== resultFilters.platform) {
      return false;
    }
    if (!passesPostFilters(result, searchFilters)) {
      return false;
    }
    return true;
  });

  return (
    <ModuleShell
      eyebrow="Search Module"
      title="Sweep public job boards for the best application URL."
      description="Search by job title and location, choose the hiring platforms you want, then watch the crawler step through LinkedIn, SEEK, Indeed, CareerOne, Adzuna, and Talent.com with live progress and deduped results."
      stats={[
        { label: "Run mode", value: isSearching ? "Live" : "Ready" },
        { label: "Results", value: `${results.length}` },
        { label: "Blocked sources", value: `${blockedCount}` },
      ]}
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="section-kicker">Hybrid Discovery</p>
            <h2 className="text-foreground font-display text-3xl">Best effort, source by source.</h2>
            <p className="text-muted-foreground text-sm leading-7">
              LinkedIn is crawled directly, while the other boards use the same hybrid HTML-plus-fallback flow
              so each source can degrade gracefully instead of taking the whole run down.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Live progress per source",
              "Cancelable runs with partial results preserved",
              "Best publicly obtainable application URL on each card",
            ].map((item) => (
              <div
                key={item}
                className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3"
              >
                <span className="status-dot" />
                <span className="text-foreground text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {error ? (
        <Reveal>
          <GlassPanel className="border-rose-400/30 p-4">
            <p className="text-sm text-rose-700 dark:text-rose-100">{error}</p>
          </GlassPanel>
        </Reveal>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Reveal>
          <GlassPanel className="p-6 sm:p-8">
            <SectionHeading
              eyebrow="Search Brief"
              title="Define the target before the crawl starts"
              description="Pick the role, location, hiring platforms, and a focused filter set so the crawler can stay reliable while still narrowing results meaningfully."
            />

            <form className="mt-8 space-y-5" onSubmit={handleSearch}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Job title</span>
                  <input
                    className="input-premium"
                    placeholder="Software Engineer"
                    value={form.jobTitle}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, jobTitle: event.target.value }))
                    }
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Location</span>
                  <input
                    className="input-premium"
                    placeholder="Melbourne"
                    value={form.location}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, location: event.target.value }))
                    }
                  />
                </label>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-foreground text-sm font-medium">Hiring platforms</legend>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedAllSources}
                      onChange={(event) => toggleAllSources(event.target.checked)}
                    />
                    <span className="text-sm text-foreground">All platforms</span>
                  </label>

                  {SEARCH_SOURCES.map((source) => (
                    <label
                      key={source}
                      className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={form.selectedSources.includes(source)}
                        onChange={(event) => toggleSource(source, event.target.checked)}
                      />
                      <span className="text-sm text-foreground">{SOURCE_LABELS[source]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Posted within</span>
                  <select
                    className="input-premium"
                    value={form.filters.postedWithin}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          postedWithin: event.target.value as SearchRequest["filters"]["postedWithin"],
                        },
                      }))
                    }
                  >
                    {POSTED_WITHIN_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {postedLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Workplace mode</span>
                  <select
                    className="input-premium"
                    value={form.filters.workplaceMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          workplaceMode: event.target.value as SearchRequest["filters"]["workplaceMode"],
                        },
                      }))
                    }
                  >
                    {WORKPLACE_MODE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {workplaceLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Employment type</span>
                  <select
                    className="input-premium"
                    value={form.filters.employmentType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          employmentType: event.target.value as SearchRequest["filters"]["employmentType"],
                        },
                      }))
                    }
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {employmentLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Max results per source</span>
                  <select
                    className="input-premium"
                    value={form.maxResultsPerSource}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxResultsPerSource: Number(event.target.value) as SearchRequest["maxResultsPerSource"],
                      }))
                    }
                  >
                    {MAX_RESULTS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} results
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className="button-primary"
                  disabled={
                    isSearching ||
                    !form.jobTitle.trim() ||
                    !form.location.trim() ||
                    form.selectedSources.length === 0
                  }
                  type="submit"
                >
                  {isSearching ? "Searching..." : "Start Search"}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={cancelSearch}
                  disabled={!isSearching}
                >
                  Cancel Run
                </button>
                <button className="button-secondary" type="button" onClick={resetSearch}>
                  Reset Results
                </button>
              </div>
            </form>
          </GlassPanel>
        </Reveal>

        <Reveal delay={0.06}>
          <GlassPanel className="p-6 sm:p-7">
            <SectionHeading
              eyebrow="Run Status"
              title="What the worker is doing now"
              description={statusMessage}
            />

            <div className="mt-6 space-y-4">
              <div className="surface-subtle rounded-[1.35rem] p-4">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.22em]">Current state</div>
                <div className="text-foreground mt-2 text-lg font-semibold">
                  {isSearching ? "Crawl in progress" : "Idle"}
                </div>
                <div className="text-muted-foreground mt-2 text-sm leading-7">{statusMessage}</div>
              </div>

              {summary ? (
                <div className="surface-subtle text-muted-foreground rounded-[1.35rem] p-4 text-sm">
                  Finished in <span className="text-foreground font-semibold">{formatElapsed(summary.elapsedMs)}</span>
                  {" with "}
                  <span className="text-foreground font-semibold">{summary.totalResults}</span> results.
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </Reveal>
      </div>

      <Reveal delay={0.08}>
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Source Progress"
            title="Track each board independently"
            description="Each source can finish, block, or degrade separately without stopping the rest of the run."
          />

          <StaggerGroup className="mt-8 grid gap-4 lg:grid-cols-3">
            {visibleSources.map((source) => {
              const progress = sourceProgress[source];
              return (
                <StaggerItem key={source}>
                  <div className={`rounded-[1.4rem] border p-5 ${statusClasses(progress.status)}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] opacity-70">Source</div>
                        <div className="mt-2 font-display text-2xl text-current">
                          {SOURCE_LABELS[source]}
                        </div>
                      </div>
                      <span className="metric-chip border-current/20 bg-black/10 text-current">
                        {progress.status}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-current/15 bg-current/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] opacity-70">Pages</div>
                        <div className="mt-1 text-xl font-semibold text-current">
                          {progress.pagesScanned}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-current/15 bg-current/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] opacity-70">Matches</div>
                        <div className="mt-1 text-xl font-semibold text-current">
                          {progress.resultsFound}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-current/85">
                      {progress.blockedReason || progress.message || "Queued"}
                    </p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        </GlassPanel>
      </Reveal>

      <Reveal delay={0.12}>
        <GlassPanel className="p-6 sm:p-8">
          <SectionHeading
            eyebrow="Results"
            title="Review deduped application targets"
            description="Cards prefer an external apply destination when the board exposes one, then fall back to the best board URL we could obtain publicly."
            action={
              summary ? (
                <div className="metric-chip">
                  {summary.totalResults} results in {formatElapsed(summary.elapsedMs)}
                </div>
              ) : (
                <div className="metric-chip">{results.length} queued results</div>
              )
            }
          />

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Match strength</span>
              <select
                className="input-premium"
                value={resultFilters.match}
                onChange={(event) =>
                  setResultFilters((current) => ({
                    ...current,
                    match: event.target.value as MatchFilter,
                  }))
                }
              >
                {MATCH_FILTER_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {matchLabels[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Platform</span>
              <select
                className="input-premium"
                value={resultFilters.platform}
                onChange={(event) =>
                  setResultFilters((current) => ({
                    ...current,
                    platform: event.target.value as PlatformFilter,
                  }))
                }
              >
                {PLATFORM_FILTER_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {platformLabels[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Posted within</span>
              <select
                className="input-premium"
                value={resultFilters.postedWithin}
                onChange={(event) =>
                  setResultFilters((current) => ({
                    ...current,
                    postedWithin: event.target.value as PostedWithin,
                  }))
                }
              >
                {POSTED_WITHIN_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {postedLabels[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Workplace mode</span>
              <select
                className="input-premium"
                value={resultFilters.workplaceMode}
                onChange={(event) =>
                  setResultFilters((current) => ({
                    ...current,
                    workplaceMode: event.target.value as WorkplaceMode,
                  }))
                }
              >
                {WORKPLACE_MODE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {workplaceLabels[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-foreground text-sm font-medium">Employment type</span>
              <select
                className="input-premium"
                value={resultFilters.employmentType}
                onChange={(event) =>
                  setResultFilters((current) => ({
                    ...current,
                    employmentType: event.target.value as EmploymentType,
                  }))
                }
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {employmentLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredResults.length ? (
            <div className="mt-8 grid gap-4 xl:grid-cols-2">
              {filteredResults.map((result) => (
                <article
                  key={result.id}
                  className="interactive-card rounded-[1.5rem] p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="metric-chip">{SOURCE_LABELS[result.source]}</span>
                    <span className="metric-chip">{result.applicationUrlType}</span>
                    <span className="metric-chip">{result.searchQueryMatch}</span>
                  </div>

                  <div className="mt-5 space-y-2">
                    <h3 className="text-foreground font-display text-2xl">{result.title}</h3>
                    {/* Motivation vs Logic:
                        Motivation: Search result cards should not shift when source data is missing so users can scan faster.
                        Logic: Always render placeholder text for both company and location (with the separator) so each card stays visually consistent. */}
                    <p className="text-muted-foreground text-sm">
                      {result.company || "Company TBD"} • {result.location || "Location TBD"}
                    </p>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      {result.postedText || "Posted time unavailable"}
                    </p>
                  </div>

                  <p className="text-muted-foreground mt-4 text-sm leading-7">
                    {result.snippet || "No snippet was publicly exposed for this listing."}
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <a
                      href={result.applicationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="button-primary"
                    >
                      Open application URL
                    </a>
                    <a
                      href={result.listingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="button-secondary"
                    >
                      Open listing page
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground mt-8 rounded-[1.5rem] border border-dashed border-border/75 bg-[hsl(var(--surface-1)/0.5)] p-8 text-sm leading-7">
              {results.length === 0
                ? summary
                  ? "The crawl finished without any jobs that survived the source-level and post-normalization filters."
                  : "Start a search to stream application targets into this panel."
                : "No results match the current card filters."}
            </div>
          )}
        </GlassPanel>
      </Reveal>
    </ModuleShell>
  );
}
