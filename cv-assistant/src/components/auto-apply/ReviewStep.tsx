"use client";

import { useEffect, useMemo, useState } from "react";
import { ATS_LABELS, type AtsProvider } from "@/lib/auto-apply/ats";
import { cn } from "@/lib/utils";
import { autoApplyApi } from "./api";
import { Chip, EmptyState, Spinner, STAGE_LABELS } from "./ui";
import type { AutoApplyController } from "./useAutoApply";
import type { DraftAnswer } from "./types";

const SOURCE_LABEL: Record<string, string> = { profile: "From your profile", preference: "Your standing answer", memory: "Remembered", ai: "Drafted by AI", user: "You", document: "Attached", default: "Default" };
const CONTACT = new Set(["first_name", "last_name", "full_name", "preferred_name", "email", "phone", "linkedin", "github", "website", "location", "current_company"]);

function AnswerField({ answer, value, onChange, remember, onRemember }: { answer: DraftAnswer; value: string; onChange: (value: string) => void; remember: boolean; onRemember: (value: boolean) => void }) {
  const id = `answer-${answer.questionId.replace(/[^a-z0-9]/gi, "-")}`;
  const missing = answer.needsInput && !value.trim();
  const options = answer.options.length || answer.type !== "boolean" ? answer.options : [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }];
  const control =
    options.length && answer.type !== "multiselect" ? (
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="input-premium min-h-11" aria-invalid={missing}>
        <option value="">Choose…</option>
        {options.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}
      </select>
    ) : answer.type === "textarea" ? (
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="input-premium min-h-28 resize-y leading-6" aria-invalid={missing} />
    ) : (
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} className="input-premium min-h-11" aria-invalid={missing} />
    );
  const edited = value !== answer.value;
  return (
    <div className={cn("rounded-2xl border p-3 sm:p-4", missing ? "border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning-soft))]" : "border-border/70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label htmlFor={id} className="text-foreground min-w-0 flex-1 break-words text-sm font-medium leading-5">
          {answer.label}
          {answer.required ? <span className="text-[hsl(var(--danger))]" aria-label="required"> *</span> : null}
        </label>
        <Chip tone={answer.source === "ai" ? "info" : missing ? "warning" : "neutral"}>{missing ? "Needs you" : edited ? "Edited" : SOURCE_LABEL[answer.source] || answer.source}</Chip>
      </div>
      <div className="mt-2">{control}</div>
      {answer.note && (missing || answer.needsInput) ? <p className="text-muted-foreground mt-1.5 text-xs leading-5">{answer.note}</p> : null}
      {answer.source === "ai" && answer.confidence > 0 && answer.confidence < 0.6 ? <p className="text-[hsl(var(--warning))] mt-1.5 text-xs">Low confidence. Please check this answer.</p> : null}
      {edited && value.trim() && !CONTACT.has(answer.category) ? (
        <label className="text-muted-foreground mt-2 flex min-h-8 cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={remember} onChange={(event) => onRemember(event.target.checked)} className="accent-[hsl(var(--primary))]" />
          Remember this answer for future applications
        </label>
      ) : null}
    </div>
  );
}

function Detail({ c }: { c: AutoApplyController }) {
  const detail = c.detail;
  const [values, setValues] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState<Record<string, boolean>>({});
  const [cover, setCover] = useState("");
  const draftId = detail?.draft?._id;

  useEffect(() => {
    if (!detail?.draft) return;
    setValues(Object.fromEntries(detail.draft.answers.map((answer) => [answer.questionId, answer.value])));
    setCover(detail.draft.coverLetterText);
    setRemember({});
    // reset only when a different draft loads or it is re-saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, detail?.draft?.preparedAt, detail?.draft?.finalReviewStatus]);

  const answers = useMemo(() => detail?.draft?.answers || [], [detail]);
  const dirty = useMemo(
    () => answers.some((answer) => (values[answer.questionId] ?? answer.value) !== answer.value) || (detail?.draft ? cover !== detail.draft.coverLetterText : false),
    [answers, values, cover, detail],
  );
  const missing = answers.filter((answer) => answer.needsInput && !(values[answer.questionId] ?? "").trim()).length;

  if (c.detailLoading) return <div className="surface-subtle h-64 animate-pulse rounded-2xl" aria-busy="true" />;
  if (!detail) return <EmptyState title="Select an application" body="Choose one from the list to review its answers and cover letter." />;
  if (!detail.draft) {
    return (
      <EmptyState
        title="This role has not been prepared"
        body="Prepare it to draft the cover letter and answer the employer's questions."
        action={
          <button type="button" className="button-primary min-h-11" disabled={Boolean(c.busy[`prep:${detail.job._id}`])} onClick={() => void c.act(`prep:${detail.job._id}`, () => autoApplyApi.prepare(detail.job._id), "Application prepared.")}>
            {c.busy[`prep:${detail.job._id}`] ? <Spinner /> : null}Prepare application
          </button>
        }
      />
    );
  }

  const job = detail.job;
  const editable = !["approved", "applied"].includes(job.status);
  const letterClaims = detail.draft.letterClaims || [];
  // "The letter is short because ..." explains a thin profile; it is not a claim to check, so it is shown on its own and does not ask for confirmation.
  const shortNote = letterClaims.find((item) => /^the letter is short because/i.test(item));
  const claimsToCheck = letterClaims.filter((item) => item !== shortNote);
  const flaggedLetter = claimsToCheck.length ? { note: `Check these before approving: ${claimsToCheck.join("; ")}. Edit anything that is not accurate; approval is not blocked.` } : undefined;
  // A note that asks the applicant to fix their profile comes first, so it is never cut off by the three-note limit.
  const riskNotes = [...(detail.draft.riskNotes || [])].sort((a, b) => Number(/check the spelling/i.test(b)) - Number(/check the spelling/i.test(a)));
  const ordered = [...answers].filter((answer) => answer.type !== "file" && answer.category !== "cover_letter");
  const needs = ordered.filter((answer) => answer.needsInput && !(values[answer.questionId] ?? "").trim());
  const rest = ordered.filter((answer) => !needs.includes(answer));
  const contact = rest.filter((answer) => CONTACT.has(answer.category));
  const questions = rest.filter((answer) => !CONTACT.has(answer.category));
  const provider = job.ats?.provider as AtsProvider | undefined;
  const stage = STAGE_LABELS[job.status] || STAGE_LABELS.prepared;

  async function save() {
    const payload = answers
      .filter((answer) => (values[answer.questionId] ?? answer.value) !== answer.value)
      .map((answer) => ({ questionId: answer.questionId, value: values[answer.questionId] ?? "", remember: Boolean(remember[answer.questionId]) }));
    const remembered = payload.some((item) => item.remember);
    await c.act(
      `save:${job._id}`,
      async () => {
        await autoApplyApi.saveAnswers(job._id, { answers: payload.length ? payload : undefined, coverLetterText: cover !== detail!.draft!.coverLetterText ? cover : undefined });
        if (remembered && c.activeId) await autoApplyApi.refreshAnswers(c.activeId);
      },
      remembered ? "Saved. Remembered answers were applied to your other applications." : "Saved.",
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-foreground break-words font-display text-xl leading-snug">{job.title}</h3>
            <p className="text-muted-foreground break-words text-sm">{job.company} · {job.location}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={stage.tone}>{stage.label}</Chip>
            <Chip tone="neutral">{provider && provider !== "unknown" ? ATS_LABELS[provider] : "Employer site"}</Chip>
          </div>
        </div>
        {job.fitReasons?.length ? <p className="text-muted-foreground text-sm leading-6">Why it fits: {job.fitReasons.slice(0, 2).join(" ")}</p> : null}
        {riskNotes.length ? (
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs leading-5">
            {riskNotes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
          </ul>
        ) : null}
      </div>

      {missing ? (
        <div role="alert" className="status-chip status-warning !flex !rounded-2xl !p-3 !text-sm !font-normal">
          {missing} answer{missing === 1 ? " needs" : "s need"} you before this can be approved. Tick “Remember” and it fills automatically next time.
        </div>
      ) : null}

      {needs.length ? (
        <section aria-label="Needs your answer" className="space-y-3">
          <h4 className="text-foreground text-sm font-semibold">Needs your answer</h4>
          {needs.map((answer) => (
            <AnswerField key={answer.questionId} answer={answer} value={values[answer.questionId] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [answer.questionId]: value }))} remember={Boolean(remember[answer.questionId])} onRemember={(value) => setRemember((current) => ({ ...current, [answer.questionId]: value }))} />
          ))}
        </section>
      ) : null}

      <section aria-label="Cover letter" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-foreground text-sm font-semibold">Cover letter</h4>
          <div className="flex items-center gap-2">
            {detail.draft.generatedBy ? <span className="text-muted-foreground text-xs">Drafted from your CV</span> : null}
            {editable ? (
              <button
                type="button"
                className="button-secondary min-h-9 px-3 text-xs"
                disabled={Boolean(c.busy[`cover:${job._id}`]) || dirty}
                title="Re-reads the job posting and re-picks your strongest proof, using the same cover letter agent as the Cover Letter studio."
                onClick={() => void c.act(`cover:${job._id}`, () => autoApplyApi.rewriteCoverLetter(job._id, false), "Cover letter rewritten from the job posting. Check the notes above for anything to verify.")}
              >
                {c.busy[`cover:${job._id}`] ? <Spinner /> : null}Rewrite from job posting
              </button>
            ) : null}
            {editable ? (
              <button
                type="button"
                className="button-secondary min-h-9 px-3 text-xs"
                disabled={Boolean(c.busy[`cover:${job._id}`]) || dirty}
                title="Runs the multi-step Cover Letter studio agent: it plans requirement coverage, writes, then audits. Takes about two minutes."
                onClick={() => void c.act(`cover:${job._id}`, () => autoApplyApi.rewriteCoverLetter(job._id, true), "Cover letter rewritten with the advanced agent. Check the notes above for anything to verify.")}
              >
                Advanced rewrite (~2 min)
              </button>
            ) : null}
          </div>
        </div>
        <textarea value={cover} onChange={(event) => setCover(event.target.value)} readOnly={!editable} rows={12} className="input-premium min-h-60 resize-y font-sans leading-7" aria-label="Cover letter text" />
        {!cover.trim() ? <p className="text-[hsl(var(--warning))] text-xs">The cover letter could not be generated. Use Re-prepare to try again.</p> : null}
        {shortNote ? <p className="text-muted-foreground text-xs leading-5">{`${shortNote.charAt(0).toUpperCase()}${shortNote.slice(1)}.`}</p> : null}
        {flaggedLetter ? (
          <div role="alert" className="surface-subtle space-y-2 rounded-2xl border border-[hsl(var(--warning))]/40 p-3">
            <p className="text-[hsl(var(--warning))] text-xs font-semibold">Worth a check</p>
            <p className="text-muted-foreground text-xs leading-5">{flaggedLetter.note}</p>
            {editable ? (
              <button type="button" className="button-secondary min-h-11 px-3 text-xs" disabled={Boolean(c.busy[`confirm:${job._id}`]) || dirty} onClick={() => void c.act(`confirm:${job._id}`, () => autoApplyApi.saveAnswers(job._id, { confirmCoverLetter: true }), "Cover letter confirmed.")}>
                Mark as checked
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {questions.length ? (
        <section aria-label="Application questions" className="space-y-3">
          <h4 className="text-foreground text-sm font-semibold">Application questions <span className="text-muted-foreground text-xs font-normal">{questions.length}</span></h4>
          {questions.map((answer) => (
            <AnswerField key={answer.questionId} answer={answer} value={values[answer.questionId] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [answer.questionId]: value }))} remember={Boolean(remember[answer.questionId])} onRemember={(value) => setRemember((current) => ({ ...current, [answer.questionId]: value }))} />
          ))}
        </section>
      ) : null}

      {contact.length ? (
        <details className="surface-subtle rounded-2xl">
          <summary className="text-foreground min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-semibold">Your details <span className="text-muted-foreground ml-1 text-xs font-normal">{contact.length} fields from your profile</span></summary>
          <div className="space-y-3 px-4 pb-4">
            {contact.map((answer) => (
              <AnswerField key={answer.questionId} answer={answer} value={values[answer.questionId] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [answer.questionId]: value }))} remember={false} onRemember={() => undefined} />
            ))}
          </div>
        </details>
      ) : null}

      <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-[hsl(var(--surface-1)/0.96)] p-3 shadow-elevated backdrop-blur">
        {editable ? (
          <>
            <button type="button" className="button-secondary min-h-11" disabled={!dirty || Boolean(c.busy[`save:${job._id}`])} onClick={() => void save()}>
              {c.busy[`save:${job._id}`] ? <Spinner /> : null}Save changes
            </button>
            <button
              type="button"
              className="button-primary min-h-11"
              disabled={dirty || missing > 0 || Boolean(c.busy[`approve:${job._id}`]) || !cover.trim()}
              onClick={() => void c.act(`approve:${job._id}`, () => autoApplyApi.approve(c.activeId!, [job._id]).then((result) => { if (result.skipped.length) throw new Error(result.skipped[0].reason); }), "Approved. Open it from the Apply step.")}
            >
              {c.busy[`approve:${job._id}`] ? <Spinner /> : null}Approve application
            </button>
            <button type="button" className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:text-foreground" disabled={Boolean(c.busy[`prep:${job._id}`])} onClick={() => void c.act(`prep:${job._id}`, () => autoApplyApi.prepare(job._id), "Application re-prepared.")}>
              {c.busy[`prep:${job._id}`] ? <Spinner /> : null}Re-prepare
            </button>
            <p className="text-muted-foreground ml-auto text-xs" role="status">{dirty ? "Unsaved changes" : missing ? "Answer the highlighted questions" : "Everything is answered"}</p>
          </>
        ) : (
          <>
            <button type="button" className="button-primary min-h-11" onClick={() => c.setStep("apply")}>Go to Apply</button>
            {job.status === "approved" ? (
              <button type="button" className="button-secondary min-h-11" onClick={() => void c.act(`approve:${job._id}`, () => autoApplyApi.approve(c.activeId!, [job._id], true), "Approval withdrawn.")}>Withdraw approval</button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function ReviewStep({ c }: { c: AutoApplyController }) {
  const jobs = (c.data?.jobs || []).filter((job) => ["needs_input", "prepared", "approved", "applied", "preparing"].includes(job.status));
  const ready = jobs.filter((job) => job.status === "prepared");
  const needs = jobs.filter((job) => job.status === "needs_input");
  const open = c.selectedJobId;

  useEffect(() => {
    if (!open && jobs.length) {
      const first = needs[0] || ready[0] || jobs[0];
      void c.openJob(first._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobs.length]);

  if (!jobs.length) {
    return <EmptyState title="Nothing to review yet" body="Prepared applications appear here once a search completes." action={<button type="button" className="button-primary min-h-11" onClick={() => c.setStep("matches")}>See matches</button>} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-foreground font-display text-2xl">Review applications</h2>
          <p className="text-muted-foreground text-sm leading-6">{ready.length} ready to approve{needs.length ? ` · ${needs.length} need your answers` : ""}. Approve in one click when you are happy.</p>
        </div>
        <button
          type="button"
          disabled={!ready.length || Boolean(c.busy.approveAll)}
          className="button-primary min-h-11"
          onClick={() => void c.act("approveAll", () => autoApplyApi.approve(c.activeId!, ready.map((job) => job._id)), `Approved ${ready.length} application${ready.length === 1 ? "" : "s"}.`).then((ok) => { if (ok) c.setStep("apply"); })}
        >
          {c.busy.approveAll ? <Spinner /> : null}Approve all ready ({ready.length})
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <ul aria-label="Applications" className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
          {jobs.map((job) => {
            const stage = STAGE_LABELS[job.status];
            const active = open === job._id;
            return (
              <li key={job._id}>
                <button type="button" onClick={() => void c.openJob(job._id)} aria-current={active ? "true" : undefined} className={cn("surface-subtle w-full rounded-2xl p-3 text-left transition-colors", active && "border-primary/60 bg-primary/10")}>
                  <span className="text-foreground block break-words text-sm font-semibold leading-snug">{job.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{job.company}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip tone={stage.tone}>{stage.label}{job.status === "needs_input" && job.missingAnswers ? ` · ${job.missingAnswers}` : ""}</Chip>
                    <span className="text-muted-foreground text-xs">Fit {job.fitScore}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0"><Detail c={c} /></div>
      </div>
    </div>
  );
}
