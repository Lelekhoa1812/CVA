"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type GenerateStep = {
  id: string;
  shortLabel: string;
  label: string;
};

type SectionNavigatorProps = {
  steps: readonly GenerateStep[];
  onSelect: (id: string) => void;
};

export default function SectionNavigator({ steps, onSelect }: SectionNavigatorProps) {
  const [activeId, setActiveId] = useState(steps[0]?.id ?? "");

  useEffect(() => {
    const elements = steps
      .map((step) => document.getElementById(step.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        if (!visible.size) return;
        const next = [...visible.entries()].sort((left, right) => left[1] - right[1])[0]?.[0];
        if (next) setActiveId(next);
      },
      { rootMargin: "-150px 0px -42% 0px", threshold: [0.08, 0.2, 0.45] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [steps]);

  function onKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-step]")];
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    const last = buttons.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  return (
    <nav
      aria-label="Cover letter steps"
      className="sticky top-[5.5rem] z-30 rounded-2xl border border-border/70 bg-[hsl(var(--background)/0.94)] p-1.5 shadow-elevated backdrop-blur-xl lg:top-28 lg:z-20 lg:self-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
    >
      <p className="section-kicker mb-2 hidden px-1 lg:block">Steps</p>
      <ol onKeyDown={onKeyDown} className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-1.5">
        {steps.map((step, index) => {
          const active = step.id === activeId;
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                data-step={step.id}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  "flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:py-2 lg:text-left",
                  active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-[hsl(var(--surface-2)/0.85)] hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-[hsl(var(--surface-2)/0.9)] text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <span className="max-w-full truncate text-[11px] font-semibold leading-4 lg:hidden">{step.shortLabel}</span>
                <span className="hidden min-w-0 truncate text-sm font-semibold lg:inline">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
