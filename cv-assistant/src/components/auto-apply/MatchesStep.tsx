"use client";

import { useMemo, useState } from "react";
import { ATS_LABELS, type AtsProvider } from "@/lib/auto-apply/ats";
import { SOURCE_LABELS, type SearchSource } from "@/lib/search/types";
import { cn } from "@/lib/utils";
import { autoApplyApi } from "./api";
import { Chip, EmptyState, Spinner, STAGE_LABELS } from "./ui";
import type { AutoApplyController } from "./useAutoApply";
import type { JobSummary } from "./types";

const VERDICT: Record<string, { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  strong: { label: "Strong match", tone: "success" },
  good: { label: "Good match", tone: "info" },
  stretch: { label: "Stretch", tone: "warning" },
  poor: { label: "Weak match", tone: "neutral" },
};

type Filter = "best" | "employer" | "all" | "skipped";

function sourceLabel(job: JobSummary) {
  const provider = job.ats?.provider as AtsProvider | undefined;
  if (job.discoveredVia === "career_site" && provider) return `${ATS_LABELS[provider] || "Career site"} career site`;
  return SOURCE_LABELS[job.source as SearchSource] || job.source;
}

function JobCard({ job, c }: { job: JobSummary; c: AutoApplyController }) {
  const stage = STAGE_LABELS[job.status] || STAGE_LABELS.discovered;
  const verdict = VERDICT[job.fitVerdict] || (job.scoredBy === "heuristic" ? { label: "Unscored", tone: "neutral" as const } : VERDICT.good);
  const manual = c.data?.session.mode === "manual_curate";
  const canSelect = ["discovered", "shortlisted", "skipped", "failed"].includes(job.status);
  const canSkip = ["discovered", "shortlisted", "selected", "needs_input", "prepared"].includes(job.status);
  const canOpen = ["needs_input", "prepared", "approved", "applied"].includes(job.status);
  const busy = Boolean(c.busy[`job:${job._id}`]);
  const employerForm = job.formSource === "employer_schema";

  return (
    <li className={cn("surface-subtle rounded-2xl p-4", job.status === "skipped" && "opacity-70")}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center" aria-label={`Fit score ${job.fitScore} out of 100`}>
          <div className="text-foreground font-display text-2xl leading-none">{job.fitScore}</div>
          <div className="text-muted-foreground mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">Fit</div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-foreground break-words text-base font-semibold leading-snug">{job.title}</h3>
            <p className="text-muted-foreground break-words text-sm">
              {job.company || "Company not listed"} · {job.location || "Location not listed"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={verdict.tone}>{verdict.label}</Chip>
            <Chip tone={stage.tone}>{stage.label}{job.status === "needs_input" && job.missingAnswers ? ` · ${job.missingAnswers}` : ""}</Chip>
            <Chip tone={employerForm ? "success" : "neutral"} title={employerForm ? "The employer's own application form was read, so answers match it exactly." : "Prepared with the standard question set."}>
              {employerForm ? "Employer form read" : "Standard pack"}
            </Chip>
            <span className="text-muted-foreground text-xs">{sourceLabel(job)}</span>
          </div>
          {job.fitReasons?.length ? <p className="text-muted-foreground text-sm leading-6">{job.fitReasons.slice(0, 2).join(" ")}</p> : null}
          {job.fitGaps?.length ? (
            <p className="text-sm leading-6">
              <span className="text-[hsl(var(--warning))] font-medium">Gaps: </span>
              <span className="text-muted-foreground">{job.fitGaps.slice(0, 3).join(" · ")}</span>
            </p>
          ) : null}
          {job.lastError ? <p className="text-[hsl(var(--danger))] text-sm">{job.lastError}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {canOpen ? (
          <button type="button" className="button-primary min-h-11" onClick={() => { void c.openJob(job._id); c.setStep(job.status === "approved" || job.status === "applied" ? "apply" : "review"); }}>
            {job.status === "needs_input" ? "Answer & review" : job.status === "prepared" ? "Review" : "Open"}
          </button>
        ) : null}
        {canSelect && job.status !== "failed" ? (
          <button
            type="button"
            disabled={busy}
            className={manual ? "button-primary min-h-11" : "button-secondary min-h-11"}
            onClick={() => void c.act(`job:${job._id}`, () => autoApplyApi.setStage(job._id, "selected"), "Queued for preparation.")}
          >
            {busy ? <Spinner /> : null}
            {job.status === "skipped" ? "Restore" : "Select"}
          </button>
        ) : null}
        {job.status === "failed" ? (
          <button type="button" disabled={busy} className="button-secondary min-h-11" onClick={() => void c.act(`job:${job._id}`, () => autoApplyApi.prepare(job._id), "Application prepared.")}>
            {busy ? <Spinner /> : null}Retry
          </button>
        ) : null}
        {canSkip ? (
          <button type="button" disabled={busy} className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => void c.act(`job:${job._id}`, () => autoApplyApi.setStage(job._id, "skipped"))}>
            Skip
          </button>
        ) : null}
        {job.url || job.applyUrl ? (
          <a href={job.url || job.applyUrl} target="_blank" rel="noreferrer" className="ml-auto min-h-11 inline-flex items-center rounded-full px-3 text-sm font-semibold text-[hsl(var(--info))] underline-offset-4 hover:underline">
            View listing<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

export default function MatchesStep({ c }: { c: AutoApplyController }) {
  const [filter, setFilter] = useState<Filter>("best");
  const jobs = useMemo(() => c.data?.jobs || [], [c.data]);
  const counts = c.data?.counts;
  const manual = c.data?.session.mode === "manual_curate";
  const visible = useMemo(() => {
    switch (filter) {
      case "best":
        return jobs.filter((job) => job.status !== "skipped" && job.fitScore >= 62);
      case "employer":
        return jobs.filter((job) => job.status !== "skipped" && job.formSource === "employer_schema");
      case "skipped":
        return jobs.filter((job) => job.status === "skipped");
      default:
        return jobs;
    }
  }, [jobs, filter]);

  const tabs: Array<[Filter, string, number]> = [
    ["best", "Best matches", jobs.filter((job) => job.status !== "skipped" && job.fitScore >= 62).length],
    ["employer", "Employer forms", jobs.filter((job) => job.status !== "skipped" && job.formSource === "employer_schema").length],
    ["all", "All roles", jobs.length],
    ["skipped", "Skipped", counts?.skipped || 0],
  ];

  if (c.running && !jobs.length) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="space-y-1">
          <h2 className="text-foreground font-display text-2xl">Finding your matches</h2>
          <p className="text-muted-foreground text-sm leading-6">Searching employer career sites and job boards, then reading each employer&apos;s application form.</p>
        </div>
        {[0, 1, 2].map((item) => (
          <div key={item} className="surface-subtle h-28 animate-pulse rounded-2xl" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <EmptyState
        title="No roles yet"
        body="Describe the role you want and run a search. Results are ranked against your CV."
        action={<button type="button" className="button-primary min-h-11" onClick={() => c.setStep("brief")}>Set up a search</button>}
      />
    );
  }

  const selected = counts?.selected || 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-foreground font-display text-2xl">{jobs.length} roles for “{c.data?.session.prompt}”</h2>
          <p className="text-muted-foreground text-sm leading-6">
            {manual ? "Select the roles you want, then prepare them." : "The best matches were prepared automatically. You can also select more."}
          </p>
        </div>
        {selected ? (
          <button type="button" disabled={c.running || Boolean(c.busy.prepare)} className="button-primary min-h-11" onClick={() => void c.act("prepare", async () => { await autoApplyApi.run(c.activeId!, "prepare"); }, "Preparing your selected roles.")}>
            {c.busy.prepare ? <Spinner /> : null}
            Prepare {selected} selected
          </button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Filter roles" className="flex flex-wrap gap-2">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={cn("min-h-10 rounded-full border px-4 text-sm font-medium transition-colors", filter === id ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/80 text-muted-foreground hover:border-primary/30")}
          >
            {label} <span className="text-muted-foreground ml-1 text-xs">{count}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <ul className="space-y-3">
          {visible.map((job) => <JobCard key={job._id} job={job} c={c} />)}
        </ul>
      ) : (
        <EmptyState title="Nothing in this view" body="Switch to All roles to see everything that was found." />
      )}
    </div>
  );
}
