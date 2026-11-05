"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const focusScrollClass = "scroll-mt-40 scroll-mb-28 lg:scroll-mt-24 lg:scroll-mb-0";

export function DisclosureSection({
  open,
  onToggle,
  kicker,
  title,
  meta,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  kicker: string;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  const panelId = useId();

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn("flex min-h-11 w-full items-start gap-3 py-1 text-left", focusScrollClass)}
      >
        <span className="min-w-0 flex-1">
          <span className="section-kicker">{kicker}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-foreground font-display break-words text-xl leading-tight sm:text-2xl">{title}</span>
            {meta ? <span className="text-muted-foreground text-xs font-medium">{meta}</span> : null}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 pt-1 text-xs font-semibold">{open ? "Hide" : "Show"}</span>
      </button>
      <div id={panelId} hidden={!open} className={open ? "mt-4 min-w-0" : undefined}>
        {open ? children : null}
      </div>
    </div>
  );
}

export function DetailsToggle({
  label,
  children,
  open,
  onToggle,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
}) {
  const panelId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  function toggle() {
    if (onToggle) onToggle();
    else setUncontrolledOpen((current) => !current);
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-[hsl(var(--surface-1)/0.55)] px-3 text-left",
          focusScrollClass,
        )}
      >
        <span className="text-foreground min-w-0 break-words text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground shrink-0 text-xs font-medium">{isOpen ? "Hide" : "Show"}</span>
      </button>
      <div id={panelId} hidden={!isOpen} className={isOpen ? "mt-3 min-w-0" : undefined}>
        {isOpen ? children : null}
      </div>
    </div>
  );
}

export function ChoiceRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3",
        checked ? "border border-primary/55 bg-primary/10" : "surface-subtle",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={cn("mt-0.5 h-6 w-6 shrink-0 accent-primary", focusScrollClass)}
      />
      <span className="min-w-0">
        <span className="text-foreground block break-words text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-1 block break-words text-xs leading-5">{description}</span>
      </span>
    </label>
  );
}

export function SelectableRow({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3",
        checked ? "border border-primary/55 bg-primary/10" : "surface-subtle",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={cn("mt-0.5 h-6 w-6 shrink-0 accent-primary", focusScrollClass)}
      />
      <span className="min-w-0">
        <span className="text-foreground block break-words text-sm font-medium">{title}</span>
        {detail ? <span className="text-muted-foreground mt-1 block break-words text-xs leading-5">{detail}</span> : null}
      </span>
    </label>
  );
}
