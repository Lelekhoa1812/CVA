"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className="text-muted-foreground block text-xs font-medium">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground block text-xs leading-5">{hint}</span> : null}
    </label>
  );
}

export type ChipTone = "success" | "warning" | "info" | "danger" | "neutral";

export function Chip({ tone = "neutral", children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span className={cn("status-chip", `status-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}

export function Disclosure({ title, meta, children, defaultOpen = false }: { title: string; meta?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="surface-subtle rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left"
      >
        <span className="text-foreground text-sm font-semibold">
          {title}
          {meta ? <span className="text-muted-foreground ml-2 text-xs font-normal">{meta}</span> : null}
        </span>
        <span className="text-muted-foreground text-xs font-semibold">{open ? "Hide" : "Show"}</span>
      </button>
      <div id={id} hidden={!open} className="space-y-4 px-4 pb-4">
        {open ? children : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="surface-subtle flex flex-col items-start gap-2 rounded-2xl p-6">
      <p className="text-foreground text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-prose text-sm leading-6">{body}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function timeAgo(value?: string) {
  if (!value) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export const STAGE_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  discovered: { label: "Found", tone: "neutral" },
  shortlisted: { label: "Good match", tone: "info" },
  selected: { label: "Queued", tone: "info" },
  preparing: { label: "Preparing", tone: "info" },
  needs_input: { label: "Needs you", tone: "warning" },
  prepared: { label: "Ready to approve", tone: "success" },
  approved: { label: "Approved", tone: "success" },
  applied: { label: "Applied", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};
