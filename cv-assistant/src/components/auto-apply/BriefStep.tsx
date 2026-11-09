"use client";

import Link from "next/link";
import { EMPLOYMENT_TYPE_OPTIONS, SEARCH_SOURCES, SOURCE_LABELS, WORKPLACE_MODE_OPTIONS } from "@/lib/search/types";
import { cn } from "@/lib/utils";
import { Chip, Disclosure, Field, Spinner, timeAgo } from "./ui";
import type { AutoApplyController } from "./useAutoApply";

const WORKPLACE_LABELS: Record<string, string> = { any: "Any workplace", remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const EMPLOYMENT_LABELS: Record<string, string> = { any: "Any type", "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", internship: "Internship" };

const YES_NO = [
  { value: "", label: "Ask me each time" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function Select({ value, onChange, children, id }: { value: string; onChange: (value: string) => void; children: React.ReactNode; id?: string }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="input-premium min-h-11">
      {children}
    </select>
  );
}

export default function BriefStep({ c }: { c: AutoApplyController }) {
  const { brief, setBrief, prefs, setPrefs } = c;
  const starting = Boolean(c.busy.start);
  const locked = c.running || starting;
  const profileMissing = c.hasProfile === false;
  const prefsFilled = Object.values(prefs).filter(Boolean).length;
  const importantMissing = !prefs.workRights || !prefs.salaryExpectation || !prefs.noticePeriod;

  return (
    <div className="space-y-6">
      {profileMissing ? (
        <div className="status-chip status-warning !flex !rounded-2xl !p-4 !text-sm !font-normal" role="alert">
          <span>
            Your profile is empty. <Link href="/profile" className="font-semibold underline underline-offset-4">Import your CV on the Profile page</Link> so applications can be tailored to you.
          </span>
        </div>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="How Auto Apply works">
        {[
          ["Search", "Employer career sites and job boards. Each employer's own form is read."],
          ["Prepare", "Every role is scored against your CV; answers and a cover letter are drafted from your real experience."],
          ["Approve", "Review once and approve in one click. Sensitive answers come only from you."],
          ["Apply", "Autofill the form in your own browser, then press Submit yourself."],
        ].map(([title, body], index) => (
          <li key={title} className="surface-subtle flex gap-3 rounded-2xl p-3">
            <span className="bg-primary/15 text-foreground grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold" aria-hidden="true">{index + 1}</span>
            <span className="text-muted-foreground text-xs leading-5"><span className="text-foreground text-sm font-semibold">{title}</span><br />{body}</span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="brief-role" className="space-y-4">
        <div>
          <h2 id="brief-role" className="text-foreground font-display text-2xl">What role are you after?</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            The assistant searches employer career sites and job boards, reads each employer&apos;s real application form, scores every role against your CV, and prepares complete applications.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Field label="Role or job title">
            <input
              value={brief.prompt}
              onChange={(event) => setBrief({ prompt: event.target.value })}
              placeholder="e.g. AI Engineer"
              className="input-premium min-h-11"
              disabled={locked}
              autoComplete="off"
            />
          </Field>
          <Field label="Location">
            <input
              value={brief.location}
              onChange={(event) => setBrief({ location: event.target.value })}
              placeholder="e.g. Melbourne"
              className="input-premium min-h-11"
              disabled={locked}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-1.5" disabled={locked}>
            <legend className="text-muted-foreground text-xs font-medium">How hands-on do you want to be?</legend>
            <div className="grid gap-2">
              {(
                [
                  ["ai_coaching", "Autopilot", "Applies your limit to the best matches and prepares them all."],
                  ["manual_curate", "I'll choose", "Shows ranked roles; prepares only the ones you select."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
                    brief.mode === value ? "border-primary/50 bg-primary/10" : "border-border/80 hover:border-primary/30",
                  )}
                >
                  <input type="radio" name="mode" checked={brief.mode === value} onChange={() => setBrief({ mode: value })} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
                  <span>
                    <span className="text-foreground block text-sm font-semibold">{label}</span>
                    <span className="text-muted-foreground block text-xs leading-5">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Maximum applications to prepare" hint="Autopilot stops at this number.">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={brief.applicationLimit}
              onChange={(event) => setBrief({ applicationLimit: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })}
              className="input-premium min-h-11"
              disabled={locked}
            />
          </Field>
          <Field label="Approve ready applications automatically" hint="Only drafts that are complete, with no cover-letter claim to check and no weak guess, are approved. Anything else stays for you.">
            <Select id="auto-approve" value={String(brief.autoApproveMinFit)} onChange={(value) => setBrief({ autoApproveMinFit: Number(value) || 0 })}>
              <option value="0">Off: I approve each one</option>
              <option value="80">Fit 80 or higher</option>
              <option value="70">Fit 70 or higher</option>
              <option value="62">Any shortlisted fit (62+)</option>
            </Select>
          </Field>
        </div>

        <fieldset disabled={locked} className="space-y-2">
          <legend className="text-muted-foreground text-xs font-medium">Where to look</legend>
          <div className="flex flex-wrap gap-2">
            {SEARCH_SOURCES.map((source) => {
              const on = brief.selectedSources.includes(source);
              return (
                <label
                  key={source}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/80 text-muted-foreground hover:border-primary/30",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setBrief({ selectedSources: on ? brief.selectedSources.filter((item) => item !== source) : [...brief.selectedSources, source] })}
                  />
                  <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", on ? "bg-primary" : "bg-border")} />
                  {SOURCE_LABELS[source]}
                </label>
              );
            })}
            <Chip tone="success" title="Employer career sites are always searched">Company career sites</Chip>
          </div>
        </fieldset>

        <Disclosure title="More filters" meta="optional">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seniority">
              <input value={brief.seniority} onChange={(event) => setBrief({ seniority: event.target.value })} placeholder="e.g. Senior" className="input-premium min-h-11" />
            </Field>
            <Field label="Workplace">
              <Select value={brief.workplaceMode} onChange={(value) => setBrief({ workplaceMode: value })}>
                {WORKPLACE_MODE_OPTIONS.map((option) => <option key={option} value={option}>{WORKPLACE_LABELS[option]}</option>)}
              </Select>
            </Field>
            <Field label="Employment type">
              <Select value={brief.employmentType} onChange={(value) => setBrief({ employmentType: value })}>
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{EMPLOYMENT_LABELS[option]}</option>)}
              </Select>
            </Field>
            <Field label="Must mention" hint="Comma separated">
              <input value={brief.mustHaveKeywords} onChange={(event) => setBrief({ mustHaveKeywords: event.target.value })} placeholder="python, llm" className="input-premium min-h-11" />
            </Field>
            <Field label="Exclude keywords" hint="Roles containing these are skipped">
              <input value={brief.excludeKeywords} onChange={(event) => setBrief({ excludeKeywords: event.target.value })} placeholder="security clearance" className="input-premium min-h-11" />
            </Field>
            <Field label="Skip these companies">
              <input value={brief.companyBlacklist} onChange={(event) => setBrief({ companyBlacklist: event.target.value })} placeholder="Acme, Globex" className="input-premium min-h-11" />
            </Field>
          </div>
        </Disclosure>
      </section>

      <section aria-labelledby="brief-prefs" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="brief-prefs" className="text-foreground font-display text-2xl">Your standing answers</h2>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm leading-6">
              Employers ask the same personal questions every time. Answer them once and every application fills them in automatically. Nothing sensitive is ever guessed.
            </p>
          </div>
          {importantMissing ? <Chip tone="warning">{prefsFilled ? "Almost there" : "Recommended"}</Chip> : <Chip tone="success">Ready</Chip>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Right to work in Australia">
            <input value={prefs.workRights} onChange={(event) => setPrefs({ workRights: event.target.value })} placeholder="e.g. Australian citizen, or visa type" className="input-premium min-h-11" />
          </Field>
          <Field label="Need visa sponsorship?">
            <Select value={prefs.requiresSponsorship} onChange={(value) => setPrefs({ requiresSponsorship: value as "" | "yes" | "no" })}>
              {YES_NO.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field label="Salary expectation">
            <input value={prefs.salaryExpectation} onChange={(event) => setPrefs({ salaryExpectation: event.target.value })} placeholder="e.g. $150,000 + super" className="input-premium min-h-11" />
          </Field>
          <Field label="Notice period / start date">
            <input value={prefs.noticePeriod} onChange={(event) => setPrefs({ noticePeriod: event.target.value })} placeholder="e.g. 2 weeks" className="input-premium min-h-11" />
          </Field>
          <Field label="Current location">
            <input value={prefs.currentLocation} onChange={(event) => setPrefs({ currentLocation: event.target.value })} placeholder="e.g. Melbourne, VIC" className="input-premium min-h-11" />
          </Field>
          <Field label="Open to relocating?">
            <Select value={prefs.willingToRelocate} onChange={(value) => setPrefs({ willingToRelocate: value as "" | "yes" | "no" })}>
              {YES_NO.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field label="Happy with hybrid / in-office?">
            <Select value={prefs.hybridOk} onChange={(value) => setPrefs({ hybridOk: value as "" | "yes" | "no" })}>
              {YES_NO.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field label="GitHub URL" hint="Optional">
            <input value={prefs.github} onChange={(event) => setPrefs({ github: event.target.value })} placeholder="github.com/you" className="input-premium min-h-11" />
          </Field>
        </div>
        <label className="surface-subtle flex cursor-pointer items-start gap-3 rounded-2xl p-4">
          <input
            type="checkbox"
            checked={prefs.standingConsent === "yes"}
            onChange={(event) => setPrefs({ standingConsent: event.target.checked ? "yes" : "" })}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span className="text-sm leading-6">
            <span className="text-foreground block font-semibold">Confirm privacy, terms and background-check consents for me</span>
            <span className="text-muted-foreground block">
              Employers ask you to agree to their privacy policy, terms or a background check. Tick this once and those boxes are filled for you. Statements about your own history, such as a criminal record or a conflict of interest, are never confirmed for you.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="button-secondary min-h-11" disabled={!c.prefsDirty || Boolean(c.busy.savePrefs)} onClick={() => void c.act("savePrefs", () => c.savePrefs())}>
            {c.busy.savePrefs ? <Spinner /> : null}Save standing answers
          </button>
          <p className="text-muted-foreground text-xs leading-5">{c.prefsDirty ? "Unsaved changes. Saving also fills them into applications that were waiting on you." : "Saved to your account."}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void c.start()} disabled={locked || profileMissing} className="button-primary min-h-12 px-7 disabled:opacity-50">
          {starting ? <Spinner /> : null}
          {starting ? "Starting…" : c.activeId ? "Search again" : "Find & prepare applications"}
        </button>
        {c.activeId ? (
          <button type="button" onClick={() => void c.start({ fresh: true })} disabled={locked || profileMissing} className="button-secondary min-h-12 disabled:opacity-50">
            Start a new search
          </button>
        ) : null}
        <p className="text-muted-foreground text-xs leading-5">{c.prefsDirty ? "Your standing answers are saved when you start." : "Takes about two minutes."}</p>
      </div>

      {c.sessions.length ? (
        <section aria-labelledby="brief-history" className="space-y-3">
          <h3 id="brief-history" className="text-foreground text-sm font-semibold">Previous searches</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {c.sessions.slice(0, 6).map((session) => (
              <li key={session._id}>
                <button
                  type="button"
                  onClick={() => c.resumeSession(session)}
                  aria-current={session._id === c.activeId ? "true" : undefined}
                  className={cn(
                    "surface-subtle flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left",
                    session._id === c.activeId && "border-primary/50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="text-foreground block truncate text-sm font-medium">{session.prompt || "Untitled search"}</span>
                    <span className="text-muted-foreground block truncate text-xs">{session.filters?.location || "Australia"} · {timeAgo(session.updatedAt)}</span>
                  </span>
                  <span className="text-muted-foreground text-xs font-semibold">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
