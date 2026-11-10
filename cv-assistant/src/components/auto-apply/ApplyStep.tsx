"use client";

import { useCallback, useMemo, useState } from "react";
import { ATS_LABELS, type AtsProvider } from "@/lib/auto-apply/ats";
import { buildBookmarklet } from "@/lib/auto-apply/autofill-script";
import { encodePackForFragment, type AutofillPack } from "@/lib/auto-apply/pack";
import { autoApplyApi } from "./api";
import { Chip, EmptyState, Spinner } from "./ui";
import type { AutoApplyController } from "./useAutoApply";
import type { JobSummary } from "./types";

const FRAGMENT_LIMIT = 24000;

function Bookmarklet() {
  const href = useMemo(() => buildBookmarklet(), []);
  // React blocks javascript: hrefs in JSX, so the bookmarklet link is set on the element directly.
  const ref = useCallback((node: HTMLAnchorElement | null) => {
    if (node) node.setAttribute("href", href);
  }, [href]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a ref={ref} onClick={(event) => event.preventDefault()} draggable className="button-primary min-h-11 cursor-grab" title="Drag this to your bookmarks bar">
        Autofill with CV Assistant
      </a>
      <button
        type="button"
        className="button-secondary min-h-11 px-3 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(href);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied. Make a bookmark and paste it as the address" : "Copy bookmarklet code"}
      </button>
    </div>
  );
}

const AGENT_TONES: Record<string, "success" | "warning" | "danger" | "info"> = { submitted: "success", ready: "info", blocked: "warning", failed: "danger", uncertain: "warning" };
const AGENT_LABELS: Record<string, string> = { submitted: "Submitted by the agent", ready: "Agent: filled and checked", blocked: "Agent stopped", failed: "Form rejected it", uncertain: "Sent? Check first" };

function AgentLine({ job }: { job: JobSummary }) {
  const agent = job.agent;
  if (!agent?.status) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <Chip tone={AGENT_TONES[agent.status] || "neutral"}>{AGENT_LABELS[agent.status] || agent.status}</Chip>
      <span className="text-muted-foreground min-w-0 flex-1 break-words leading-6">{agent.status === "ready" ? `${agent.filled} of ${agent.total} fields filled. Nothing was sent.` : agent.reason}</span>
      <a className="text-muted-foreground hover:text-foreground text-xs font-semibold underline underline-offset-4" href={`/api/auto-apply/job/${job._id}/agent/screenshot`} target="_blank" rel="noreferrer">What the agent saw</a>
    </div>
  );
}

function AgentPanel({ c, approved }: { c: AutoApplyController; approved: number }) {
  const [confirming, setConfirming] = useState(false);
  const mode = c.brief.applyMode;
  const submitting = mode === "agent_submit";
  const busy = Boolean(c.busy.agentRun);
  const run = () => void c.act("agentRun", () => autoApplyApi.agentRun(c.activeId!), submitting ? "The agent is applying. Progress shows below and in the activity log." : "The agent is filling and checking your approved applications.").then(() => setConfirming(false));
  return (
    <section aria-labelledby="agent-panel" className="surface-subtle space-y-3 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="agent-panel" className="text-foreground text-sm font-semibold">Apply agent <span className="text-muted-foreground font-normal">· runs on this computer</span></h3>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm leading-6">
            {submitting
              ? "It opens each approved form, fills it from your approved answers, checks nothing required is empty, presses Submit and reads the employer's confirmation. It never works around a CAPTCHA or sign-in; those come back to you."
              : mode === "agent_check"
                ? "It opens each approved form, fills it from your approved answers and checks nothing required is empty. You press Submit."
                : "It can fill and check each approved form for you. Set “When an application is approved” in the Brief to let it submit too."}
          </p>
        </div>
        {!confirming ? (
          <button type="button" className="button-primary min-h-11" disabled={!approved || busy} onClick={() => (submitting ? setConfirming(true) : run())}>
            {busy ? <Spinner /> : null}{submitting ? `Apply to ${approved} for me` : `Fill and check ${approved}`}
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm agent submission">
            <span className="text-sm">Send {approved} application{approved === 1 ? "" : "s"} to employers now?</span>
            <button type="button" className="button-primary min-h-11" disabled={busy} onClick={run}>Yes, submit</button>
            <button type="button" className="button-secondary min-h-11" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        )}
      </div>
    </section>
  );
}

function ApplyCard({ job, c }: { job: JobSummary; c: AutoApplyController }) {
  const [confirming, setConfirming] = useState(false);
  const [hint, setHint] = useState("");
  const busy = Boolean(c.busy[`apply:${job._id}`]);
  const applied = job.status === "applied";
  const provider = job.ats?.provider as AtsProvider | undefined;

  async function openForm() {
    setHint("");
    await c.act(`apply:${job._id}`, async () => {
      const { pack, applyUrl, text } = await autoApplyApi.pack(job._id);
      const json = JSON.stringify(pack);
      let copied = false;
      try {
        await navigator.clipboard.writeText(json);
        copied = true;
      } catch {
        copied = false;
      }
      const fragment = encodePackForFragment(pack as AutofillPack);
      const target = fragment.length < FRAGMENT_LIMIT ? `${applyUrl}#cva=${fragment}` : applyUrl;
      const opened = window.open(target, "_blank", "noopener");
      setHint(
        opened
          ? copied
            ? "Form opened and the pack is on your clipboard. Click the Autofill bookmark on that page."
            : "Form opened. Click the Autofill bookmark on that page."
          : `Your browser blocked the new tab. Open ${applyUrl} yourself, then click the Autofill bookmark.`,
      );
      void text;
    });
  }

  async function copyText() {
    await c.act(`apply:${job._id}`, async () => {
      const { text } = await autoApplyApi.pack(job._id);
      await navigator.clipboard.writeText(text);
      setHint("Answers copied. Paste them into the form.");
    });
  }

  return (
    <li className="surface-subtle rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-foreground break-words text-base font-semibold leading-snug">{job.title}</h3>
          <p className="text-muted-foreground break-words text-sm">{job.company} · {job.location}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {applied ? <Chip tone="success">{job.agent?.status === "submitted" ? "Applied (employer's page confirmed)" : "Applied (confirmed by you)"}</Chip> : <Chip tone="info">Approved</Chip>}
          <Chip tone="neutral">{provider && provider !== "unknown" ? ATS_LABELS[provider] : "Employer site"}</Chip>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void openForm()} disabled={busy} className={applied ? "button-secondary min-h-11" : "button-primary min-h-11"}>
          {busy ? <Spinner /> : null}{applied ? "Open form again" : "Open form & copy pack"}
        </button>
        <button type="button" onClick={() => void copyText()} disabled={busy} className="button-secondary min-h-11">Copy answers as text</button>
        {!applied && !confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground">I submitted it</button>
        ) : null}
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm submission">
            <span className="text-muted-foreground text-sm">Did you press Submit on the employer&apos;s site?</span>
            <button type="button" className="button-primary min-h-11" disabled={busy} onClick={() => void c.act(`apply:${job._id}`, () => autoApplyApi.markApplied(job._id), "Marked as applied.").then(() => setConfirming(false))}>Yes, mark applied</button>
            <button type="button" className="button-secondary min-h-11" onClick={() => setConfirming(false)}>Not yet</button>
          </span>
        ) : null}
        {applied ? (
          <button type="button" className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => void c.act(`apply:${job._id}`, () => autoApplyApi.markApplied(job._id, true))}>Undo</button>
        ) : null}
        <button type="button" className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => { void c.openJob(job._id); c.setStep("review"); }}>View answers</button>
      </div>
      {c.agentAvailable && job.agent?.status ? <AgentLine job={job} /> : null}
      {hint ? <p role="status" className="text-muted-foreground mt-3 text-sm leading-6">{hint}</p> : null}
    </li>
  );
}

export default function ApplyStep({ c }: { c: AutoApplyController }) {
  const jobs = (c.data?.jobs || []).filter((job) => job.status === "approved" || job.status === "applied");
  const applied = jobs.filter((job) => job.status === "applied").length;

  if (!jobs.length) {
    return <EmptyState title="Nothing approved yet" body="Approve prepared applications in the Review step. They will appear here ready to open and autofill." action={<button type="button" className="button-primary min-h-11" onClick={() => c.setStep("review")}>Go to Review</button>} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-foreground font-display text-2xl">Apply</h2>
        <p className="text-muted-foreground text-sm leading-6">
          {applied} of {jobs.length} applied.{" "}
          {c.agentAvailable && c.brief.applyMode === "agent_submit"
            ? "The agent submits each approved form for you and reads the employer's confirmation. Anything it cannot finish, such as a CAPTCHA or a sign-in, comes back to you here."
            : c.agentAvailable && c.brief.applyMode === "agent_check"
              ? "The agent fills and checks each approved form. You press Submit on the employer's site."
              : "You press Submit on each employer's form, so every application is yours and employers see you, not a bot."}
        </p>
      </div>

      {c.agentAvailable ? <AgentPanel c={c} approved={jobs.filter((job) => job.status === "approved").length} /> : null}

      <section aria-labelledby="how-autofill" className="surface-subtle space-y-4 rounded-2xl p-4 sm:p-5">
        <h3 id="how-autofill" className="text-foreground text-sm font-semibold">One-time setup, then two clicks per application</h3>
        <ol className="text-muted-foreground grid gap-3 text-sm leading-6 sm:grid-cols-3">
          <li><span className="text-foreground font-semibold">1. Install.</span> Drag this button to your bookmarks bar (once).</li>
          <li><span className="text-foreground font-semibold">2. Open.</span> Press “Open form & copy pack” on any application below.</li>
          <li><span className="text-foreground font-semibold">3. Fill.</span> On the employer page click the bookmark. It fills the form and highlights anything left for you.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Bookmarklet />
          <p className="text-muted-foreground text-xs leading-5">Runs only in your own browser tab. It never presses Submit, solves CAPTCHAs, or sends your data anywhere.</p>
        </div>
      </section>

      <ul className="space-y-3">{jobs.map((job) => <ApplyCard key={job._id} job={job} c={c} />)}</ul>
    </div>
  );
}
