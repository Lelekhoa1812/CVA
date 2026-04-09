"use client";

import { useEffect, useMemo, useState } from "react";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/Reveal";

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

export default function GeneratePage() {
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [shouldSelect, setShouldSelect] = useState(true);
  const [indices, setIndices] = useState<number[] | null>(null);
  const [rankings, setRankings] = useState<RankedEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [manualSelection, setManualSelection] = useState<{ projects: number[]; experiences: number[] }>({
    projects: [],
    experiences: [],
  });
  const [enableManualSelection, setEnableManualSelection] = useState(false);

  async function selectRelevant() {
    setError(null);
    const res = await fetch("/api/generate/select", {
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

  async function generate() {
    setLoading(true);
    setResult("");
    setError(null);

    let finalIndices: number[] | null = null;

    if (enableManualSelection && (manualSelection.projects.length > 0 || manualSelection.experiences.length > 0)) {
      const projectCount = profile?.projects?.length || 0;
      finalIndices = [
        ...manualSelection.projects.map((idx) => idx),
        ...manualSelection.experiences.map((idx) => idx + projectCount),
      ];
    } else if (shouldSelect && indices && indices.length > 0) {
      finalIndices = indices;
    }

    const res = await fetch("/api/generate/cover-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, jobDescription, indices: finalIndices }),
    });

    if (!res.ok) {
      setError("Failed to generate");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setResult(data.coverLetter);
    setLoading(false);
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
      const res = await fetch("/api/generate/cover-letter/pdf", {
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
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      }
    })();
  }, []);

  useEffect(() => {
    if (shouldSelect && jobDescription.trim()) {
      setIndices(null);
      setRankings([]);
    }
  }, [jobDescription, shouldSelect]);

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
            <h2 className="font-display text-3xl text-white">Narrative with proof</h2>
            <p className="text-sm leading-7 text-slate-300">
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
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="status-dot" />
                <span className="text-sm text-slate-200">{item}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {error ? (
        <Reveal>
          <GlassPanel className="border-destructive/40 p-4">
            <p className="text-sm text-rose-200">{error}</p>
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
                  <span className="text-sm font-medium text-slate-200">Company name</span>
                  <input
                    className="input-premium"
                    placeholder="Google, Canva, Atlassian..."
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">Job description</span>
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
                    <p className="text-sm font-semibold text-white">AI Coaching</p>
                    <p className="text-xs leading-6 text-slate-400">
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
                      if (!event.target.checked) {
                        setManualSelection({ projects: [], experiences: [] });
                      }
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">Curate manually</p>
                    <p className="text-xs leading-6 text-slate-400">
                      Pick the exact projects and experiences that should be woven into the letter.
                    </p>
                  </div>
                </label>
              </div>

              {enableManualSelection && profile ? (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="interactive-card space-y-3">
                    <p className="text-sm font-semibold text-white">Projects</p>
                    <div className="space-y-2">
                      {profile.projects?.length ? (
                        profile.projects.map((project, idx) => (
                          <label key={`${project.name}-${idx}`} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                            <input
                              type="checkbox"
                              checked={manualSelection.projects.includes(idx)}
                              onChange={() => toggleProject(idx)}
                              className="mt-1 h-4 w-4"
                            />
                            <div>
                              <div className="text-sm font-medium text-slate-100">
                                {project.name || "Untitled Project"}
                              </div>
                              {project.summary ? (
                                <div className="mt-1 text-xs leading-6 text-slate-400">{project.summary}</div>
                              ) : null}
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">No projects added yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="interactive-card space-y-3">
                    <p className="text-sm font-semibold text-white">Experiences</p>
                    <div className="space-y-2">
                      {profile.experiences?.length ? (
                        profile.experiences.map((experience, idx) => (
                          <label
                            key={`${experience.companyName}-${experience.role}-${idx}`}
                            className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3"
                          >
                            <input
                              type="checkbox"
                              checked={manualSelection.experiences.includes(idx)}
                              onChange={() => toggleExperience(idx)}
                              className="mt-1 h-4 w-4"
                            />
                            <div>
                              <div className="text-sm font-medium text-slate-100">
                                {experience.companyName} · {experience.role}
                              </div>
                              {experience.summary ? (
                                <div className="mt-1 text-xs leading-6 text-slate-400">{experience.summary}</div>
                              ) : null}
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">No experiences added yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {shouldSelect && rankings.length > 0 ? (
                <div className="mt-6 interactive-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">AI Coaching results</p>
                    <span className="metric-chip">{rankings.length} items</span>
                  </div>
                  <StaggerGroup className="space-y-2">
                    {rankings.map((item, index) => {
                      return (
                        <StaggerItem key={`${item.type}-${item.index}`}>
                          <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                            <span className="status-dot mt-2" />
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium text-slate-100">{item.title}</div>
                                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                {item.type}
                              </div>
                              <div className="mt-2 text-xs leading-6 text-slate-400">{item.justification}</div>
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

                <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/55 p-4">
                  {result ? (
                    <div className="space-y-4">
                      <div className="max-h-[34rem] overflow-auto whitespace-pre-wrap text-sm leading-8 text-slate-200">
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
                      <p className="font-medium text-white">Your cover letter draft will appear here.</p>
                      <p className="text-sm leading-7 text-slate-400">
                        Add the role context, pick evidence, and generate when ready.
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
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">Mode</span>
                  <span className="text-sm font-medium text-white">
                    {enableManualSelection ? "Manual curation" : shouldSelect ? "AI Coaching" : "Open generation"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">Evidence count</span>
                  <span className="text-sm font-medium text-white">{evidenceCount}</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recommendation</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
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
