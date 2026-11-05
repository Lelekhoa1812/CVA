"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClarificationAnswer, ClarificationQuestion } from "@/lib/generate/clarifications";

export type { ClarificationAnswer, ClarificationQuestion };

function answersFor(
  questions: ClarificationQuestion[],
  selected: Record<string, string[]>,
  custom: Record<string, string>,
  omitId?: string,
): ClarificationAnswer[] {
  return questions.flatMap((question) => {
    if (question.id === omitId) return [];
    const values = selected[question.id] || [];
    const answers = [
      ...question.options.filter((option) => values.includes(option.id)).map((option) => option.label),
      ...(values.includes("__custom") && custom[question.id]?.trim() ? [custom[question.id].trim()] : []),
    ];
    if (!answers.length) return [];
    return [{ question: question.decision ? `${question.decision}: ${question.prompt}` : question.prompt, answers }];
  });
}

/** One decision at a time. Unanswered decisions are left out of the draft. */
export default function ClarificationQuestions({ questions, onSubmit, onCancel }: {
  questions: ClarificationQuestion[];
  onSubmit: (answers: ClarificationAnswer[]) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const question = questions[Math.min(step, questions.length - 1)];
  const last = step >= questions.length - 1;
  const chosen = useMemo(() => answersFor(questions, selected, custom), [questions, selected, custom]);
  const decidedIds = useMemo(() => new Set(questions.filter((item) => answersFor([item], selected, custom).length > 0).map((item) => item.id)), [questions, selected, custom]);

  useEffect(() => {
    headingRef.current?.focus();
    panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [step]);

  if (!question) return null;

  function toggle(id: string) {
    setValidationError("");
    const current = selected[question.id] || [];
    const turningOffCustom = id === "__custom" && current.includes(id);
    if ((question.type === "single" && id !== "__custom") || turningOffCustom) {
      setCustom((prev) => ({ ...prev, [question.id]: "" }));
    }
    setSelected((prev) => {
      const values = prev[question.id] || [];
      const next = question.type === "single"
        ? [id]
        : values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
      return { ...prev, [question.id]: next };
    });
  }

  function validateCurrent(): boolean {
    if ((selected[question.id] || []).includes("__custom") && !custom[question.id]?.trim()) {
      setValidationError("Add your own answer, or clear that choice.");
      return false;
    }
    setValidationError("");
    return true;
  }

  function continueForward() {
    if (!validateCurrent()) return;
    if (!last) setStep((current) => current + 1);
    else onSubmit(answersFor(questions, selected, custom));
  }

  function skipCurrent() {
    const nextSelected = { ...selected, [question.id]: [] };
    const nextCustom = { ...custom, [question.id]: "" };
    setSelected(nextSelected);
    setCustom(nextCustom);
    setValidationError("");
    if (!last) setStep((current) => current + 1);
    else onSubmit(answersFor(questions, nextSelected, nextCustom, question.id));
  }

  const currentValues = selected[question.id] || [];

  return (
    <section
      ref={panelRef}
      aria-labelledby="clarification-heading"
      className="min-w-0 scroll-mt-40 scroll-mb-28 space-y-4 rounded-2xl border border-primary/25 bg-primary/10 p-4 sm:p-5 lg:scroll-mt-24 lg:scroll-mb-0"
    >
      <div className="space-y-3">
        <ol className="flex gap-1" aria-label="Decision progress">
          {questions.map((item, index) => (
            <li key={item.id} className="min-w-0 flex-1" aria-current={index === step ? "step" : undefined}>
              <span className={`block h-1 rounded-full ${
                index === step || decidedIds.has(item.id)
                  ? "bg-primary"
                  : index < step
                    ? "bg-primary/45"
                    : "bg-border"
              }`} />
              <span className="sr-only">{index === step ? "Current" : decidedIds.has(item.id) ? "Answered" : index < step ? "Skipped" : "Upcoming"}: {item.decision || item.prompt}</span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-xs">{decidedIds.size} of {questions.length} decided</p>
        <div>
          <p className="text-primary break-words text-[11px] font-semibold uppercase tracking-[0.18em]">
            Decision {step + 1} of {questions.length}
            {question.decision ? ` · ${question.decision}` : ""}
          </p>
          <h3 id="clarification-heading" ref={headingRef} tabIndex={-1} className="text-foreground mt-1 break-words rounded-sm text-base font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]">
            {question.prompt}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {question.why || "Your choice changes what the draft emphasizes."} Select an option only if it is true for you.
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {question.type === "single" ? "Choose one." : "Choose any that apply."} You can write your own answer, skip this decision, or go back.
          </p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">{question.prompt}</legend>
        {question.options.map((option) => {
          const on = currentValues.includes(option.id);
          return (
            <label
              key={option.id}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm leading-6 ${
                on ? "border-primary/55 bg-primary/10" : "surface-subtle"
              }`}
            >
              <input
                className="mt-0.5 h-6 w-6 shrink-0 accent-primary scroll-mt-40 scroll-mb-28 lg:scroll-mt-24 lg:scroll-mb-0"
                type={question.type === "single" ? "radio" : "checkbox"}
                name={`clarification-${question.id}`}
                checked={on}
                onChange={() => toggle(option.id)}
              />
              <span className="min-w-0">
                <span className="text-foreground block break-words font-medium">{option.label}</span>
                {option.detail ? <span className="text-muted-foreground mt-0.5 block break-words text-xs leading-5">{option.detail}</span> : null}
              </span>
            </label>
          );
        })}
        <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm leading-6 ${
          currentValues.includes("__custom") ? "border-primary/55 bg-primary/10" : "surface-subtle"
        }`}>
          <input
            className="mt-0.5 h-6 w-6 shrink-0 accent-primary scroll-mt-40 scroll-mb-28 lg:scroll-mt-24 lg:scroll-mb-0"
            type={question.type === "single" ? "radio" : "checkbox"}
            name={`clarification-${question.id}`}
            checked={currentValues.includes("__custom")}
            onChange={() => toggle("__custom")}
          />
          <span className="text-foreground font-medium">Write my own answer</span>
        </label>
        {currentValues.includes("__custom") ? (
          <label className="block text-sm">
            <span className="sr-only">Your answer to {question.prompt}</span>
            <textarea
              className="input-premium mt-1 min-h-20 resize-y scroll-mt-40 scroll-mb-28 text-base sm:text-sm lg:scroll-mt-24 lg:scroll-mb-0"
              value={custom[question.id] || ""}
              maxLength={500}
              onChange={(event) => {
                setValidationError("");
                setCustom((current) => ({ ...current, [question.id]: event.target.value }));
              }}
              placeholder="State only what is true for you"
            />
          </label>
        ) : null}
        {currentValues.length > 0 ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            onClick={() => {
              setSelected((current) => ({ ...current, [question.id]: [] }));
              setCustom((current) => ({ ...current, [question.id]: "" }));
              setValidationError("");
            }}
          >
            Clear this decision
          </button>
        ) : null}
      </fieldset>

      {last && chosen.length > 0 ? (
        <div className="surface-subtle min-w-0 rounded-2xl px-3.5 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.18em]">These choices will guide the draft</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6">
            {questions.flatMap((item) => {
              const entry = chosen.find((answer) => answer.question === (item.decision ? `${item.decision}: ${item.prompt}` : item.prompt));
              if (!entry) return [];
              return [(
                <li key={item.id} className="text-foreground break-words">
                  <span className="text-muted-foreground">{item.decision || item.prompt.replace(/\?$/, "")}: </span>
                  {entry.answers.join("; ")}
                </li>
              )];
            })}
          </ul>
        </div>
      ) : null}

      {validationError ? <p role="alert" className="text-destructive text-sm leading-6">{validationError}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {step > 0 ? (
          <button type="button" className="button-secondary min-h-11 w-full sm:w-28" onClick={() => { setValidationError(""); setStep((current) => current - 1); }}>
            Back
          </button>
        ) : null}
        <button type="button" onClick={continueForward} className="button-primary min-h-11 w-full flex-1">
          {last ? (chosen.length ? "Generate with these choices" : "Generate draft") : "Continue"}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="inline-flex min-h-11 items-center text-left text-sm font-medium text-primary" onClick={skipCurrent}>
          Skip this decision
        </button>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-4">
          <button type="button" className="inline-flex min-h-11 items-center text-left text-sm text-muted-foreground" onClick={() => onSubmit([])}>
            Generate without these decisions
          </button>
          <button type="button" className="inline-flex min-h-11 items-center text-left text-sm text-muted-foreground" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
