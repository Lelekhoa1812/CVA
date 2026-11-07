"use client";

import { cn } from "@/lib/utils";
import type { StepId } from "./useAutoApply";

type StepDef = { id: StepId; label: string; hint: string; count?: number; enabled: boolean; done: boolean };

export default function Stepper({ steps, current, onSelect }: { steps: StepDef[]; current: StepId; onSelect: (id: StepId) => void }) {
  return (
    <nav aria-label="Application steps">
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((step, index) => {
          const active = step.id === current;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!step.enabled}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-2xl border px-2.5 py-2 text-left transition-colors sm:flex-row sm:items-center sm:gap-3 sm:px-4",
                  active ? "border-primary/50 bg-primary/10" : "border-border/80 bg-[hsl(var(--surface-1)/0.6)] hover:border-primary/30",
                  !step.enabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    step.done ? "status-chip status-success !p-0 justify-center" : active ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--surface-3))] text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="text-foreground block text-sm font-semibold sm:truncate">
                    {step.label}
                    {step.count ? <span className="text-muted-foreground ml-1.5 text-xs font-medium">{step.count}</span> : null}
                  </span>
                  <span className="text-muted-foreground hidden truncate text-xs sm:block">{step.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
