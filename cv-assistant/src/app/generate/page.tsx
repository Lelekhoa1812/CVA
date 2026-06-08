"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";
import { buildApiUrl } from "@/lib/api";

type Project = { name: string; summary: string; description: string };
type Experience = { companyName: string; role: string; summary: string; description: string };
type Profile = { projects: Project[]; experiences: Experience[] };
type RankedEvidence = {
  index: number;
  type: "project" | "experience";
  title: string;
  summary: string;
  justification: string;
};

type SavedDraft = {
  company: string;
  jobDescription: string;
  employerQuestion: string;
  idealWordCount: string;
  answerStyle: string;
  shouldSelect: boolean;
  indices: number[] | null;
  rankings: RankedEvidence[];
  result: string;
  employerQuestionResult: string;
  manualSelection: { projects: number[]; experiences: number[] };
  enableManualSelection: boolean;
  showManualEvidence: boolean;
};

const DRAFT_STORAGE_KEY = "cv-assistant.generate.cover-letter.v2";

function loadSavedDraft(): SavedDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedDraft>;

    return {
      company: typeof parsed.company === "string" ? parsed.company : "",
      jobDescription: typeof parsed.jobDescription === "string" ? parsed.jobDescription : "",
      employerQuestion: typeof parsed.employerQuestion === "string" ? parsed.employerQuestion : "",
      idealWordCount: typeof parsed.idealWordCount === "string" ? parsed.idealWordCount : "",
      answerStyle: typeof parsed.answerStyle === "string" ? parsed.answerStyle : "",
      shouldSelect: typeof parsed.shouldSelect === "boolean" ? parsed.shouldSelect : true,
      indices: Array.isArray(parsed.indices) ? parsed.indices.filter((value) => Number.isInteger(value)) : null,
      rankings: Array.isArray(parsed.rankings) ? (parsed.rankings as RankedEvidence[]) : [],
      result: typeof parsed.result === "string" ? parsed.result : "",
      employerQuestionResult:
        typeof parsed.employerQuestionResult === "string" ? parsed.employerQuestionResult : "",
      manualSelection: {
        projects: Array.isArray(parsed.manualSelection?.projects)
          ? parsed.manualSelection!.projects.filter((value) => Number.isInteger(value))
          : [],
        experiences: Array.isArray(parsed.manualSelection?.experiences)
          ? parsed.manualSelection!.experiences.filter((value) => Number.isInteger(value))
          : [],
      },
      enableManualSelection: typeof parsed.enableManualSelection === "boolean" ? parsed.enableManualSelection : false,
      showManualEvidence: typeof parsed.showManualEvidence === "boolean" ? parsed.showManualEvidence : true,
    };
  } catch {
    return null;
  }
}

export default function GeneratePage() {
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [employerQuestion, setEmployerQuestion] = useState("");
  const [idealWordCount, setIdealWordCount] = useState("");
  const [answerStyle, setAnswerStyle] = useState("");
  const [shouldSelect, setShouldSelect] = useState(true);
  const [indices, setIndices] = useState<number[] | null>(null);
  const [rankings, setRankings] = useState<RankedEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [result, setResult] = useState("");
  const [employerQuestionResult, setEmployerQuestionResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [manualSelection, setManualSelection] = useState<{ projects: number[]; experiences: number[] }>({
    projects: [],
    experiences: [],
  });
  const [enableManualSelection, setEnableManualSelection] = useState(false);
  const [showManualEvidence, setShowManualEvidence] = useState(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const previousDraftRef = useRef<{ jobDescription: string; shouldSelect: boolean }>({
    jobDescription: "",
    shouldSelect: true,
  });

  async function selectRelevant() {
    setError(null);
    const res = await fetch(buildApiUrl("/api/generate/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription }),
    });
    if (!res.ok) {
      setError("Failed to select relevant items");
      return;
    }
    const data = await res.json();
    setIndices(data.indices);
    setRankings(Array.isArray(data.rankings) ? data.rankings : []);
  }

  function getFinalIndices() {
    if (enableManualSelection && (manualSelection.projects.length > 0 || manualSelection.experiences.length > 0)) {
      const projectCount = profile?.projects?.length || 0;
      return [
        ...manualSelection.projects.map((idx) => idx),
        ...manualSelection.experiences.map((idx) => idx + projectCount),
      ];
    }

    if (shouldSelect && indices && indices.length > 0) {
      return indices;
    }

    return null;
  }

  async function generate() {
    setLoading(true);
    setResult("");
    setError(null);
    try {
      const finalIndices = getFinalIndices();
      const res = await fetch(buildApiUrl("/api/generate/cover-letter"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, jobDescription, indices: finalIndices }),
      });

      if (!res.ok) {
        setError("Failed to generate");
        return;
      }

      const data = await res.json();
      setResult(data.coverLetter);
    } catch {
      setError("Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function answerEmployerQuestion() {
    if (!employerQuestion.trim()) return;

    setQuestionLoading(true);
    setEmployerQuestionResult("");
    setQuestionError(null);
    try {
      const finalIndices = getFinalIndices();
      const res = await fetch(buildApiUrl("/api/generate/employer-question"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          jobDescription,
          question: employerQuestion,
          idealWordCount,
          answerStyle,
          indices: finalIndices,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQuestionError(data.error || "Failed to answer employer question");
        return;
      }

      const data = await res.json();
      setEmployerQuestionResult(data.answer);
    } catch {
      setQuestionError("Failed to answer employer question");
    } finally {
      setQuestionLoading(false);
    }
  }

  async function exportPdf() {
    if (!result.trim()) return;

    setExportingPdf(true);
    setError(null);

    try {
      // Motivation vs Logic:
      // Motivation: The cover-letter page needs a formal business-letter PDF without duplicating layout
      // rules in the browser or asking the user to reformat the generated text manually.
      // Logic: Keep the client focused on orchestration, then send the generated letter to the export route
      // that owns the "Modern Executive" template and returns a ready-to-download PDF blob.
      const res = await fetch(buildApiUrl("/api/generate/cover-letter/pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, coverLetter: result }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export PDF");
      }

      const blob = await res.blob();
      if (!blob.size) {
        throw new Error("Exported PDF is empty");
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(company || "cover-letter").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cover-letter"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  function toggleProject(index: number) {
    setManualSelection((current) => ({
      ...current,
      projects: current.projects.includes(index)
        ? current.projects.filter((item) => item !== index)
        : [...current.projects, index],
    }));
  }

  function toggleExperience(index: number) {
    setManualSelection((current) => ({
      ...current,
      experiences: current.experiences.includes(index)
        ? current.experiences.filter((item) => item !== index)
        : [...current.experiences, index],
    }));
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(buildApiUrl("/api/profile"));
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      }
    })();
  }, []);

  useEffect(() => {
    const draft = loadSavedDraft();
    if (!draft) {
      setDraftHydrated(true);
      return;
    }

    setCompany(draft.company);
    setJobDescription(draft.jobDescription);
    setEmployerQuestion(draft.employerQuestion);
    setIdealWordCount(draft.idealWordCount);
    setAnswerStyle(draft.answerStyle);
    setShouldSelect(draft.shouldSelect);
    setIndices(draft.indices);
    setRankings(draft.rankings);
    setResult(draft.result);
    setEmployerQuestionResult(draft.employerQuestionResult);
    setManualSelection(draft.manualSelection);
    setEnableManualSelection(draft.enableManualSelection);
    setShowManualEvidence(draft.showManualEvidence);
    previousDraftRef.current = {
      jobDescription: draft.jobDescription,
      shouldSelect: draft.shouldSelect,
    };
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    const previous = previousDraftRef.current;
    const jobChanged = jobDescription !== previous.jobDescription;
    const selectionEnabled = shouldSelect && !previous.shouldSelect;

    if ((jobChanged || selectionEnabled) && shouldSelect && jobDescription.trim()) {
      setIndices(null);
      setRankings([]);
    }

    previousDraftRef.current = {
      jobDescription,
      shouldSelect,
    };
  }, [jobDescription, shouldSelect]);

  useEffect(() => {
    if (!draftHydrated) return;

    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          company,
          jobDescription,
          employerQuestion,
          idealWordCount,
          answerStyle,
          shouldSelect,
          indices,
          rankings,
          result,
          employerQuestionResult,
          manualSelection,
          enableManualSelection,
          showManualEvidence,
        } satisfies SavedDraft),
      );
    } catch {
      // Ignore storage failures so the page still works in restricted browser contexts.
    }
  }, [
    company,
    jobDescription,
    employerQuestion,
    idealWordCount,
    answerStyle,
    shouldSelect,
    indices,
    rankings,
    result,
    employerQuestionResult,
    manualSelection,
    enableManualSelection,
    showManualEvidence,
    draftHydrated,
  ]);

  const evidenceCount = useMemo(() => {
    if (enableManualSelection) {
      return manualSelection.projects.length + manualSelection.experiences.length;
    }
    return indices?.length || 0;
  }, [enableManualSelection, indices, manualSelection.experiences.length, manualSelection.projects.length]);

  return (
    <ModuleShell
      eyebrow="Cover Letter Module"
      title="Build a cover letter around evidence, not generic claims."
      description="Use job context, AI selection, and manual curation together so your final letter sounds tailored and confident."
      stats={[
        { label: "Selection mode", value: enableManualSelection ? "Manual" : shouldSelect ? "AI Coaching" : "Open" },
        { label: "Evidence chosen", value: `${evidenceCount}` },
        { label: "Output mode", value: result ? "Ready" : "Drafting" },
      ]}
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="section-kicker">Letter Strategy</p>
            <h2 className="text-foreground font-display text-3xl">Narrative with proof</h2>
            <p className="text-muted-foreground text-sm leading-7">
              The highest-conversion letters connect company needs to a handful of relevant
              experiences instead of repeating the resume.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Frame why this company matters to you",
              "Select evidence that maps to role requirements",
              "End with confidence and momentum",
            ].map((item) => (
              <div key={item} className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
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
          <GlassPanel className="border-destructive/40 p-4">
            <p className="text-sm text-rose-700 dark:text-rose-200">{error}</p>
          </GlassPanel>
        </Reveal>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Reveal>
            <GlassPanel className="p-6 sm:p-8">
              <SectionHeading
                eyebrow="Job Brief"
                title="Give the model a stronger read on the opportunity"
                description="The more specific the company and role context, the easier it is to produce a letter that feels intentional."
              />

              <div className="mt-8 space-y-4">
                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Company name</span>
                  <input
                    className="input-premium"
                    placeholder="Google, Canva, Atlassian..."
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Job description</span>
                  <textarea
                    className="input-premium min-h-64 resize-y"
                    placeholder="Paste the description here so the system can match requirements, responsibilities, and tone."
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                  />
                </label>
              </div>
            </GlassPanel>
          </Reveal>

          <Reveal delay={0.06}>
            <GlassPanel className="p-6 sm:p-8">
              <SectionHeading
                eyebrow="Evidence Selection"
                title="Control what the letter can reference"
                description="Use AI Coaching for speed, or hand-pick the evidence you want included."
                action={
                  shouldSelect ? (
                    <button onClick={selectRelevant} className="button-secondary">
                      Run AI Coaching
                    </button>
                  ) : null
                }
              />

              {/* Motivation: evidence selection used to feel like separate utility toggles with weak narrative context.
                  Logic: treat selection as a guided strategy step so the user understands how proof flows into the final letter. */}
              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                <label className="interactive-card flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    checked={shouldSelect}
                    onChange={(event) => setShouldSelect(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-foreground text-sm font-semibold">AI Coaching</p>
                    <p className="text-muted-foreground text-xs leading-6">
                      Rank the strongest projects and experiences against the job brief, with concise relevance rationale.
                    </p>
                  </div>
                </label>

                <label className="interactive-card flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    checked={enableManualSelection}
                    onChange={(event) => {
                      setEnableManualSelection(event.target.checked);
                      if (event.target.checked) {
                        setShowManualEvidence(true);
                      } else {
                        setManualSelection({ projects: [], experiences: [] });
                        setShowManualEvidence(true);
                      }
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-foreground text-sm font-semibold">Curate manually</p>
                    <p className="text-muted-foreground text-xs leading-6">
                      Pick the exact projects and experiences that should be woven into the letter.
                    </p>
                  </div>
                </label>
              </div>

              {enableManualSelection && profile ? (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setShowManualEvidence((current) => !current)}
                      className="text-sm font-medium text-sky-600 underline-offset-4 transition hover:underline dark:text-sky-300"
                    >
                      {showManualEvidence ? "hide" : "show"}
                    </button>
                  </div>

                  {/* Motivation vs Logic:
                      Motivation: Manual curation should foreground work history before side projects and let users collapse long evidence lists without leaving selection mode.
                      Logic: Render experiences ahead of projects and keep a small local visibility toggle so selections persist while the list is hidden. */}
                  {showManualEvidence ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="interactive-card space-y-3">
                        <p className="text-foreground text-sm font-semibold">Experiences</p>
                        <div className="space-y-2">
                          {profile.experiences?.length ? (
                            profile.experiences.map((experience, idx) => (
                              <label
                                key={`${experience.companyName}-${experience.role}-${idx}`}
                                className="surface-subtle flex gap-3 rounded-2xl p-3"
                              >
                                <input
                                  type="checkbox"
                                  checked={manualSelection.experiences.includes(idx)}
                                  onChange={() => toggleExperience(idx)}
                                  className="mt-1 h-4 w-4"
                                />
                                <div>
                                  <div className="text-foreground text-sm font-medium">
                                    {experience.companyName} · {experience.role}
                                  </div>
                                  {experience.summary ? (
                                    <div className="text-muted-foreground mt-1 text-xs leading-6">{experience.summary}</div>
                                  ) : null}
                                </div>
                              </label>
                            ))
                          ) : (
                            <p className="text-muted-foreground text-xs">No experiences added yet.</p>
                          )}
                        </div>
                      </div>

                      <div className="interactive-card space-y-3">
                        <p className="text-foreground text-sm font-semibold">Projects</p>
                        <div className="space-y-2">
                          {profile.projects?.length ? (
                            profile.projects.map((project, idx) => (
                              <label key={`${project.name}-${idx}`} className="surface-subtle flex gap-3 rounded-2xl p-3">
                                <input
                                  type="checkbox"
                                  checked={manualSelection.projects.includes(idx)}
                                  onChange={() => toggleProject(idx)}
                                  className="mt-1 h-4 w-4"
                                />
                                <div>
                                  <div className="text-foreground text-sm font-medium">
                                    {project.name || "Untitled Project"}
                                  </div>
                                  {project.summary ? (
                                    <div className="text-muted-foreground mt-1 text-xs leading-6">{project.summary}</div>
                                  ) : null}
                                </div>
                              </label>
                            ))
                          ) : (
                            <p className="text-muted-foreground text-xs">No projects added yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {shouldSelect && rankings.length > 0 ? (
                <div className="mt-6 interactive-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-foreground text-sm font-semibold">AI Coaching results</p>
                    <span className="metric-chip">{rankings.length} items</span>
                  </div>
                  <StaggerGroup className="space-y-2">
                    {rankings.map((item, index) => {
                      return (
                        <StaggerItem key={`${item.type}-${item.index}`}>
                          <div className="surface-subtle flex items-start gap-3 rounded-2xl p-3">
                            <span className="status-dot mt-2" />
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-foreground text-sm font-medium">{item.title}</div>
                                <span className="text-muted-foreground text-[11px] uppercase tracking-[0.2em]">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="text-muted-foreground mt-1 text-[11px] uppercase tracking-[0.2em]">
                                {item.type}
                              </div>
                              <div className="text-muted-foreground mt-2 text-xs leading-6">{item.justification}</div>
                            </div>
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </StaggerGroup>
                </div>
              ) : null}
            </GlassPanel>
          </Reveal>
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <Reveal delay={0.08}>
            <GlassPanel className="p-6">
              <SectionHeading
                eyebrow="Output"
                title="Generated letter"
                description="The final letter appears here with quick actions for refinement."
              />

              <div className="mt-6 space-y-4">
                <button
                  onClick={generate}
                  disabled={loading || !company.trim() || !jobDescription.trim()}
                  className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Generating cover letter..." : "Generate Cover Letter"}
                </button>

                <div className="result-well rounded-[1.4rem] p-4">
                  {result ? (
                    <div className="space-y-4">
                      <div className="text-foreground max-h-[34rem] overflow-auto whitespace-pre-wrap text-sm leading-8">
                        {result}
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          onClick={() => navigator.clipboard.writeText(result)}
                          className="button-secondary flex-1"
                        >
                          Copy
                        </button>
                        <button
                          onClick={exportPdf}
                          disabled={exportingPdf}
                          className="button-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {exportingPdf ? "Exporting PDF..." : "Export PDF"}
                        </button>
                        <button onClick={() => setResult("")} className="button-secondary flex-1">
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-10 text-center">
                      <p className="text-foreground font-medium">Your cover letter draft will appear here.</p>
                      <p className="text-muted-foreground text-sm leading-7">
                        Add the role context, pick evidence, and generate when ready.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </GlassPanel>
          </Reveal>

          <Reveal delay={0.1}>
            <GlassPanel className="p-6">
              <SectionHeading
                eyebrow="Answer Employer Question"
                title="Turn a prompt into a tailored response"
                description="Use the same evidence selection as the cover letter, then add the employer's question, a target length, and a preferred answer style."
              />

              <div className="mt-6 space-y-4">
                <label className="space-y-2">
                  <span className="text-foreground text-sm font-medium">Employer question</span>
                  <textarea
                    className="input-premium min-h-32 resize-y"
                    placeholder="Paste the employer's question here."
                    value={employerQuestion}
                    onChange={(event) => setEmployerQuestion(event.target.value)}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-foreground text-sm font-medium">Ideal Word Count (optional)</span>
                    <input
                      className="input-premium"
                      placeholder="e.g. 120"
                      value={idealWordCount}
                      onChange={(event) => setIdealWordCount(event.target.value)}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-foreground text-sm font-medium">Answer Style (optional)</span>
                    <input
                      className="input-premium"
                      placeholder="e.g. concise, direct, confident"
                      value={answerStyle}
                      onChange={(event) => setAnswerStyle(event.target.value)}
                    />
                  </label>
                </div>

                {questionError ? (
                  <div className="border-destructive/40 rounded-2xl bg-destructive/5 p-3">
                    <p className="text-sm text-rose-700 dark:text-rose-200">{questionError}</p>
                  </div>
                ) : null}

                <button
                  onClick={answerEmployerQuestion}
                  disabled={questionLoading || !employerQuestion.trim()}
                  className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {questionLoading ? "Answering employer question..." : "Generate Employer Answer"}
                </button>

                <div className="result-well rounded-[1.4rem] p-4">
                  {employerQuestionResult ? (
                    <div className="space-y-4">
                      <div className="text-foreground max-h-[22rem] overflow-auto whitespace-pre-wrap text-sm leading-8">
                        {employerQuestionResult}
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          onClick={() => navigator.clipboard.writeText(employerQuestionResult)}
                          className="button-secondary flex-1"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => setEmployerQuestionResult("")}
                          className="button-secondary flex-1"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-10 text-center">
                      <p className="text-foreground font-medium">Your employer-question answer will appear here.</p>
                      <p className="text-muted-foreground text-sm leading-7">
                        Add the question, choose an optional style, and generate when ready.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </GlassPanel>
          </Reveal>

          <Reveal delay={0.12}>
            <GlassPanel className="p-6">
              <SectionHeading
                eyebrow="Evidence Rail"
                title="What supports the story"
                description="A quick visual summary of the material currently available to the letter generator."
              />
              <div className="mt-6 space-y-3">
                <div className="surface-subtle flex items-center justify-between rounded-2xl px-4 py-3">
                  <span className="text-muted-foreground text-sm">Mode</span>
                  <span className="text-foreground text-sm font-medium">
                    {enableManualSelection ? "Manual curation" : shouldSelect ? "AI Coaching" : "Open generation"}
                  </span>
                </div>
                <div className="surface-subtle flex items-center justify-between rounded-2xl px-4 py-3">
                  <span className="text-muted-foreground text-sm">Evidence count</span>
                  <span className="text-foreground text-sm font-medium">{evidenceCount}</span>
                </div>
                <div className="surface-subtle rounded-2xl px-4 py-4">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Recommendation</p>
                  <p className="text-muted-foreground mt-2 text-sm leading-7">
                    Keep the letter anchored to two or three strong proof points. Specificity reads
                    as confidence; breadth often reads as filler.
                  </p>
                </div>
              </div>
            </GlassPanel>
          </Reveal>
        </div>
      </div>
    </ModuleShell>
  );
}
