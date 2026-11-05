"use client";

import { FormEvent, startTransition, useEffect, useRef, useState } from "react";
import GlassPanel from "@/components/ui/GlassPanel";
import ModuleShell from "@/components/ui/ModuleShell";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import CrawlFilters from "@/components/search/CrawlFilters";
import MobileSearchBar from "@/components/search/MobileSearchBar";
import PlatformPicker from "@/components/search/PlatformPicker";
import ResultCard from "@/components/search/ResultCard";
import ResultToolbar from "@/components/search/ResultToolbar";
import SourceRail from "@/components/search/SourceRail";
import { AUTOMATIC_RETRY_MESSAGE, type ResultFilters } from "@/components/search/labels";
import { defaultSearchRequest } from "@/lib/search/schema";
import { buildApiUrl } from "@/lib/api";
import { passesPostFilters } from "@/lib/search/filters";
import {
  createInitialSourceProgress,
  SEARCH_SOURCES,
  SOURCE_LABELS,
  type JobSearchResult,
  type SearchFilters,
  type SearchRequest,
  type SearchSource,
  type SearchStreamEvent,
} from "@/lib/search/types";

type CompletionSummary = {
  totalResults: number;
  blockedSources: SearchSource[];
  elapsedMs: number;
};

type AdvancedSearchQuestionDraft = {
  id: string;
  prompt: string;
  helperText?: string;
};

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function buildQuestionId(index: number) {
  return `question-${index + 1}`;
}

function buildQuestionHelper(question: string) {
  const lowered = normalizeText(question).toLowerCase();
  if (lowered.includes("location")) return "Mention places you want to prioritize or avoid.";
  if (lowered.includes("remote") || lowered.includes("hybrid") || lowered.includes("onsite")) {
    return "Describe the work setup that would make you say yes quickly.";
  }
  if (lowered.includes("stack") || lowered.includes("technology") || lowered.includes("tool")) {
    return "List the technologies or problem spaces you want to stay close to.";
  }
  return "Keep the answer brief and concrete so the search brief can stay specific.";
}

async function readJsonResponse(response: Response) {
  return response.json().catch(() => ({}));
}

function buildAdvancedSearchSession(
  questions: AdvancedSearchQuestionDraft[],
  answers: Record<string, string>,
  summary: string,
): SearchRequest["advancedSearchSession"] {
  const answered = questions
    .map((question) => ({
      questionId: question.id,
      answer: normalizeText(answers[question.id]),
      prompt: question.prompt,
      helperText: question.helperText,
    }))
    .filter((entry) => entry.answer.length > 0);

  if (!summary && answered.length === 0) {
    return null;
  }

  return {
    summary,
    questionsAsked: questions.map(({ id, prompt, helperText }) => ({ id, prompt, helperText })),
    answers: answered.map(({ questionId, answer }) => ({ questionId, answer })),
  };
}

function formatInstructionExpansionSummary(request: SearchRequest) {
  const summaryParts = [request.instructionExpansion?.summary, request.advancedSearchSession?.summary]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return summaryParts.join(" ");
}

function getDuplicateGroupCount(results: JobSearchResult[], duplicateGroupKey: string) {
  return results.filter((result) => result.duplicateGroupKey === duplicateGroupKey).length;
}

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
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
  const [archivedDuplicateGroups, setArchivedDuplicateGroups] = useState<string[]>([]);
  const [advancedQuestions, setAdvancedQuestions] = useState<AdvancedSearchQuestionDraft[]>([]);
  const [advancedAnswers, setAdvancedAnswers] = useState<Record<string, string>>({});
  const [advancedSummary, setAdvancedSummary] = useState("");
  const [isPreparingAdvancedSearch, setIsPreparingAdvancedSearch] = useState(false);
  const [advancedSearchError, setAdvancedSearchError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<AdvancedSearchQuestionDraft | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isAdvancedSearchComplete, setIsAdvancedSearchComplete] = useState(false);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
      if (event.status === "running" && event.message === AUTOMATIC_RETRY_MESSAGE) {
        setStatusMessage(`${SOURCE_LABELS[event.source]} is retrying automatically.`);
      } else if (event.status !== "error" && event.message) {
        setStatusMessage(event.message);
      }
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
      if (event.fatal || !event.source) {
        setError(event.message);
      }
      if (event.fatal) {
        setStatusMessage("The search ended early because the worker failed.");
      } else if (event.source) {
        setStatusMessage(
          `${SOURCE_LABELS[event.source]} could not complete after automatic retries. Other sources continued.`,
        );
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
    setArchivedDuplicateGroups([]);
    setSourceProgress(createInitialSourceProgress());
    setStatusMessage("Preparing the hybrid crawl.");
    setRunSources(form.selectedSources);

    try {
      // Motivation vs Logic:
      // Motivation: This feature needs to feel live while the crawler moves through multiple sources, blocked-source
      // fallbacks, and detail pages that can take noticeably longer than a normal form submit.
      // Logic: Stream NDJSON from the backend and fold each event into local UI state so the user sees per-source
      // progress, partial results, and cancellation feedback without waiting for the full crawl to complete.
      const requestPayload: SearchRequest = {
        ...form,
        searchInstruction: normalizeText(form.searchInstruction),
        advancedSearchSession: activeAdvancedSearchSession,
      };
      const response = await fetch(buildApiUrl("/api/search/jobs/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
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
        if (abortRef.current !== controller) return;
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
      if (abortRef.current === controller && controller.signal.aborted) {
        setStatusMessage("Search canceled. Partial results are still available below.");
      } else if (abortRef.current === controller) {
        const message = searchError instanceof Error ? searchError.message : "Search failed unexpectedly.";
        setError(message);
        setStatusMessage("The search could not complete.");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsSearching(false);
      }
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
    setArchivedDuplicateGroups([]);
    setAdvancedQuestions([]);
    setAdvancedAnswers({});
    setAdvancedSummary("");
    setAdvancedSearchError(null);
    setCurrentQuestion(null);
    setCurrentAnswer("");
    setIsAdvancedSearchComplete(false);
    setAdvancedOpen(false);
    setForm(defaultSearchRequest);
    setSourceProgress(createInitialSourceProgress());
    setStatusMessage("Ready to scan public job sources.");
  }

  async function prepareAdvancedSearch() {
    if (!form.jobTitle.trim()) {
      setAdvancedSearchError("Please fill in your job title and location first.");
      setAdvancedOpen(true);
      return;
    }

    setAdvancedOpen(true);
    setIsPreparingAdvancedSearch(true);
    setError(null);
    setAdvancedSearchError(null);
    setAdvancedQuestions([]);
    setAdvancedAnswers({});
    setCurrentAnswer("");
    setIsAdvancedSearchComplete(false);

    try {
      const response = await fetch(buildApiUrl("/api/search/advanced-sequential"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: form.jobTitle,
          location: form.location,
          selectedSources: form.selectedSources,
          filters: form.filters,
          searchInstruction: form.searchInstruction || "",
          previousQuestions: [],
          previousAnswers: [],
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to prepare advanced search.");
      }

      if (data.isComplete) {
        setIsAdvancedSearchComplete(true);
        setCurrentQuestion(null);
        setAdvancedSummary(typeof data.summary === "string" ? data.summary : "");
        setStatusMessage("Advanced Search completed. Ready to start the crawl.");
      } else if (data.question) {
        const question = {
          id: data.question.id || buildQuestionId(0),
          prompt: data.question.prompt,
          helperText: data.question.helperText || buildQuestionHelper(data.question.prompt),
        };
        setCurrentQuestion(question);
        setStatusMessage("Answer the question to help refine your search.");
      } else {
        throw new Error("No question received from server.");
      }
    } catch (advancedError) {
      setError(advancedError instanceof Error ? advancedError.message : "Failed to prepare advanced search.");
    } finally {
      setIsPreparingAdvancedSearch(false);
    }
  }

  async function submitCurrentAnswer() {
    if (!currentQuestion || !currentAnswer.trim()) {
      return;
    }

    setIsLoadingNextQuestion(true);
    setError(null);

    try {
      const updatedQuestions = [...advancedQuestions, currentQuestion];
      const updatedAnswers = { ...advancedAnswers, [currentQuestion.id]: currentAnswer };

      const response = await fetch(buildApiUrl("/api/search/advanced-sequential"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: form.jobTitle,
          location: form.location,
          selectedSources: form.selectedSources,
          filters: form.filters,
          searchInstruction: form.searchInstruction || "",
          previousQuestions: updatedQuestions.map(({ id, prompt, helperText }) => ({ id, prompt, helperText })),
          previousAnswers: Object.entries(updatedAnswers).map(([questionId, answer]) => ({ questionId, answer })),
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to get next question.");
      }

      setAdvancedQuestions(updatedQuestions);
      setAdvancedAnswers(updatedAnswers);
      setCurrentAnswer("");
      setAdvancedOpen(true);

      if (data.isComplete) {
        setIsAdvancedSearchComplete(true);
        setCurrentQuestion(null);
        setAdvancedSummary(typeof data.summary === "string" ? data.summary : "");
        setStatusMessage("Advanced Search completed. Ready to start the crawl.");
      } else if (data.question) {
        const question = {
          id: data.question.id || buildQuestionId(updatedQuestions.length),
          prompt: data.question.prompt,
          helperText: data.question.helperText || buildQuestionHelper(data.question.prompt),
        };
        setCurrentQuestion(question);
        setStatusMessage("Answer the next question to continue refining your search.");
      } else {
        setIsAdvancedSearchComplete(true);
        setCurrentQuestion(null);
        setStatusMessage("Advanced Search completed. Ready to start the crawl.");
      }
    } catch (nextQuestionError) {
      setError(nextQuestionError instanceof Error ? nextQuestionError.message : "Failed to get next question.");
    } finally {
      setIsLoadingNextQuestion(false);
    }
  }

  function toggleDuplicateArchive(duplicateGroupKey: string) {
    setArchivedDuplicateGroups((current) =>
      current.includes(duplicateGroupKey)
        ? current.filter((item) => item !== duplicateGroupKey)
        : [...current, duplicateGroupKey],
    );
  }

  // Motivation vs Logic:
  // Motivation: The user-facing filter includes an "All platforms" shortcut, but the backend contract should stay a
  // plain list of concrete sources so the route and crawler do not need UI-specific translation rules.
  // Logic: Store only selected source ids in form state, then derive the "all" view state and visible source cards
  // from that array for both the pre-run brief and the live progress panel.
  const selectedAllSources = form.selectedSources.length === SEARCH_SOURCES.length;
  const selectedForRun = isSearching || summary ? runSources : form.selectedSources;
  const visibleSources: SearchSource[] = selectedForRun.length > 0 ? selectedForRun : [...SEARCH_SOURCES];
  const blockedCount = visibleSources.filter((source) => sourceProgress[source].status === "blocked").length;
  const activeAdvancedSearchSession = buildAdvancedSearchSession(
    advancedQuestions,
    advancedAnswers,
    normalizeText(advancedSummary),
  );
  const canSearch =
    !isSearching && Boolean(form.jobTitle.trim()) && Boolean(form.location.trim()) && form.selectedSources.length > 0;
  const searchFilters: SearchFilters = {
    postedWithin: resultFilters.postedWithin,
    workplaceMode: resultFilters.workplaceMode,
    employmentType: resultFilters.employmentType,
  };
  // Motivation vs Logic:
  // Motivation: Result cards should be fine-grained so readers can dial in a subset of matches without re-running the crawl.
  // Logic: Track dedicated UI filters and reuse the server heuristics to drop cards before we render them.
  const filteredResults = results.filter((result) => {
    if (archivedDuplicateGroups.includes(result.duplicateGroupKey)) {
      return false;
    }
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
  const archivedResultCount = results.length - filteredResults.length;
  const instructionSummary = formatInstructionExpansionSummary({
    ...form,
    advancedSearchSession: activeAdvancedSearchSession,
  });

  return (
    <ModuleShell
      compactMobile
      className="min-w-0"
      eyebrow="Search"
      title="Find roles across public job boards."
      description="Set a title and location, choose platforms, and follow each board as matches arrive. A platform error retries on its own so the rest of the search keeps going."
      stats={[
        { label: "Run mode", value: isSearching ? "Live" : "Ready" },
        { label: "Results", value: `${results.length}` },
        { label: "Blocked", value: `${blockedCount}` },
      ]}
      aside={
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="section-kicker">How it runs</p>
            <h2 className="text-foreground font-display text-2xl">One board at a time.</h2>
            <p className="text-muted-foreground text-sm leading-6">
              Each platform can retry, finish, or drop out. Results already on screen stay put.
            </p>
          </div>
          <div className="space-y-2">
            {["Live progress per platform", "Cancel and keep partial results", "Best public application link"].map(
              (item) => (
                <div key={item} className="surface-subtle flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5">
                  <span className="status-dot shrink-0" />
                  <span className="text-foreground min-w-0 text-sm">{item}</span>
                </div>
              ),
            )}
          </div>
        </div>
      }
    >
      {error ? (
        <Reveal>
          <GlassPanel className="border-rose-400/30 p-4">
            <p role="alert" className="break-words text-sm text-rose-700 dark:text-rose-100">
              {error}
            </p>
          </GlassPanel>
        </Reveal>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <Reveal className={isSearching || summary ? "order-2 xl:order-1" : undefined}>
          <GlassPanel className="min-w-0 p-4 sm:p-6">
            <SectionHeading
              eyebrow="Brief"
              title="Set the search"
              description="Title, location, and the platforms to scan."
            />

            <form id="job-search-form" className="mt-5 min-w-0 space-y-4" onSubmit={handleSearch}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="min-w-0 space-y-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Title</span>
                  <input
                    className="input-premium min-h-11"
                    placeholder="Software Engineer"
                    value={form.jobTitle}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, jobTitle: event.target.value }));
                      if (advancedSearchError) setAdvancedSearchError(null);
                    }}
                  />
                </label>
                <label className="min-w-0 space-y-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Location</span>
                  <input
                    className="input-premium min-h-11"
                    placeholder="Melbourne"
                    value={form.location}
                    onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                  />
                </label>
              </div>

              <fieldset className="min-w-0 space-y-2">
                <legend className="text-muted-foreground text-xs font-medium">Platforms</legend>
                <PlatformPicker
                  selectedSources={form.selectedSources}
                  allSelected={selectedAllSources}
                  onToggleAll={toggleAllSources}
                  onToggleSource={toggleSource}
                />
                {form.selectedSources.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Select at least one platform.</p>
                ) : null}
              </fieldset>

              <label className="block min-w-0 space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">Instruction</span>
                <textarea
                  className="input-premium min-h-20 sm:min-h-24"
                  placeholder="Optional. Tools, industries, or work setup."
                  value={form.searchInstruction || ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      searchInstruction: event.target.value,
                    }))
                  }
                />
              </label>

              <CrawlFilters
                filters={form.filters}
                maxResultsPerSource={form.maxResultsPerSource}
                onFiltersChange={(filters) => setForm((current) => ({ ...current, filters }))}
                onMaxResultsChange={(maxResultsPerSource) =>
                  setForm((current) => ({ ...current, maxResultsPerSource }))
                }
              />

              <div className="surface-subtle min-w-0 rounded-2xl px-3">
                <button
                  className="flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-3 text-left text-sm font-medium text-foreground"
                  type="button"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <span>Advanced Q&A</span>
                  <span className="text-muted-foreground shrink-0 text-xs font-normal">
                    {isAdvancedSearchComplete
                      ? "Ready"
                      : currentQuestion
                        ? `Question ${advancedQuestions.length + 1}`
                        : "Optional"}
                  </span>
                </button>
                {advancedOpen ? (
                <div className="space-y-4 pb-3">
                  <button
                    className="button-secondary min-h-11"
                    type="button"
                    onClick={prepareAdvancedSearch}
                    disabled={isSearching || isPreparingAdvancedSearch}
                  >
                    {isPreparingAdvancedSearch
                      ? "Preparing..."
                      : advancedQuestions.length
                        ? "Refresh questions"
                        : "Start questions"}
                  </button>

                  {advancedSearchError ? (
                    <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3">
                      <p className="break-words text-sm text-rose-700 dark:text-rose-100">{advancedSearchError}</p>
                    </div>
                  ) : null}

                  {isAdvancedSearchComplete && advancedSummary ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                      <p className="break-words text-sm leading-6 text-emerald-700 dark:text-emerald-100">
                        <span className="font-semibold">Complete:</span> {advancedSummary}
                      </p>
                      {advancedQuestions.length > 0 ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                          {advancedQuestions.length} question{advancedQuestions.length === 1 ? "" : "s"} answered
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {currentQuestion ? (
                    <div className="space-y-3">
                      {advancedQuestions.length > 0 ? (
                        <p className="text-muted-foreground text-xs">Question {advancedQuestions.length + 1} of 5</p>
                      ) : null}
                      <label className="block min-w-0 space-y-1.5">
                        <span className="text-foreground text-sm font-medium">{currentQuestion.prompt}</span>
                        <textarea
                          className="input-premium min-h-20"
                          placeholder="Add your answer"
                          value={currentAnswer}
                          onChange={(event) => setCurrentAnswer(event.target.value)}
                          disabled={isLoadingNextQuestion}
                        />
                        {currentQuestion.helperText ? (
                          <span className="text-muted-foreground block text-xs leading-5">
                            {currentQuestion.helperText}
                          </span>
                        ) : null}
                      </label>
                      <button
                        className="button-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={submitCurrentAnswer}
                        disabled={isLoadingNextQuestion || !currentAnswer.trim()}
                      >
                        {isLoadingNextQuestion ? "Loading next question..." : "Submit answer"}
                      </button>
                      {advancedQuestions.length > 0 ? (
                        <div className="surface-subtle rounded-2xl p-3">
                          <p className="text-muted-foreground text-xs font-medium">Previous answers</p>
                          <div className="mt-2 space-y-2">
                            {advancedQuestions.map((question, index) => (
                              <p key={question.id} className="break-words text-xs">
                                <span className="text-foreground font-medium">Q{index + 1}:</span>{" "}
                                <span className="text-muted-foreground">{advancedAnswers[question.id] || "—"}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                ) : null}
              </div>

              <div className="hidden min-w-0 gap-2 sm:flex">
                <button
                  className="button-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSearch}
                  type="submit"
                >
                  {isSearching ? "Searching…" : "Search"}
                </button>
                <button className="button-secondary min-h-11" type="button" onClick={cancelSearch} disabled={!isSearching}>
                  Cancel
                </button>
                <button className="button-secondary min-h-11" type="button" onClick={resetSearch}>
                  Reset
                </button>
              </div>
            </form>
          </GlassPanel>
        </Reveal>

        <Reveal delay={0.06} className={isSearching || summary ? "order-1 xl:order-2" : undefined}>
          <GlassPanel className="min-w-0 p-4 sm:p-5">
            <SourceRail
              sources={visibleSources}
              sourceProgress={sourceProgress}
              isSearching={isSearching}
              statusMessage={statusMessage}
              summary={summary}
            />
          </GlassPanel>
        </Reveal>
      </div>

      <Reveal delay={0.08}>
        <GlassPanel className="min-w-0 p-4 sm:p-6">
          <SectionHeading
            eyebrow="Results"
            title="Application targets"
            description="Cards keep the best public application link, with the listing page as a fallback."
            action={
              summary ? (
                <div className="metric-chip">
                  {summary.totalResults} in {formatElapsed(summary.elapsedMs)}
                </div>
              ) : (
                <div className="metric-chip">{results.length} results</div>
              )
            }
          />

          {instructionSummary || archivedDuplicateGroups.length > 0 || archivedResultCount > 0 ? (
            <div className="surface-subtle mt-4 min-w-0 space-y-2 rounded-2xl p-3 text-sm leading-6 text-muted-foreground">
              {instructionSummary ? (
                <p className="break-words">
                  <span className="text-foreground font-semibold">AI brief:</span> {instructionSummary}
                </p>
              ) : null}
              {archivedDuplicateGroups.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <p>
                    <span className="text-foreground font-semibold">Archived groups:</span>{" "}
                    {archivedDuplicateGroups.length}
                  </p>
                  {archivedDuplicateGroups.map((key, index) => (
                    <button
                      key={key}
                      className="button-secondary min-h-11"
                      type="button"
                      onClick={() => toggleDuplicateArchive(key)}
                    >
                      {archivedDuplicateGroups.length > 1 ? `Unarchive group ${index + 1}` : "Unarchive linked duplicates"}
                    </button>
                  ))}
                </div>
              ) : null}
              {archivedResultCount > 0 ? (
                <p>
                  <span className="text-foreground font-semibold">Hidden cards:</span> {archivedResultCount}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <ResultToolbar filters={resultFilters} onChange={setResultFilters} />
          </div>

          {filteredResults.length ? (
            <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-2">
              {filteredResults.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  duplicateCount={getDuplicateGroupCount(results, result.duplicateGroupKey)}
                  archived={archivedDuplicateGroups.includes(result.duplicateGroupKey)}
                  onToggleArchive={toggleDuplicateArchive}
                />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground mt-4 rounded-2xl border border-dashed border-border/75 bg-[hsl(var(--surface-1)/0.5)] p-5 text-sm leading-6">
              {results.length === 0
                ? summary
                  ? "The crawl finished without any jobs that survived the source-level and post-normalization filters."
                  : "Start a search to stream application targets into this panel."
                : "No results match the current card filters."}
            </div>
          )}
        </GlassPanel>
      </Reveal>

      <MobileSearchBar isSearching={isSearching} canSearch={canSearch} onCancel={cancelSearch} onReset={resetSearch} />
      <div className="h-[calc(5.75rem+env(safe-area-inset-bottom))] sm:hidden" aria-hidden="true" />
    </ModuleShell>
  );
}
