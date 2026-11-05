"use client";

import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export function Switch({ checked, onCheckedChange, disabled = false, id, className, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-11 w-14 shrink-0 items-center rounded-full border px-1 transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow transition",
          checked ? "right-1 bg-primary-foreground" : "left-1 bg-foreground",
        )}
      />
    </button>
  );
}
