"use client";

import { useEffect, useState } from "react";

export default function MobileGenerateBar({
  hint,
  label,
  disabled,
  onClick,
}: {
  hint: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const [fieldFocused, setFieldFocused] = useState(false);

  useEffect(() => {
    function isField(target: EventTarget | null) {
      return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select"));
    }

    function onFocusIn(event: FocusEvent) {
      setFieldFocused(isField(event.target));
    }

    function onFocusOut() {
      window.setTimeout(() => {
        setFieldFocused(isField(document.activeElement));
      }, 0);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  if (fieldFocused) return null;

  return (
    <div
      className="!mt-0 fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-[hsl(var(--surface-1)/0.96)] px-4 pt-2 shadow-elevated backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-3">
        <p id="generate-bar-hint" className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {hint}
        </p>
        <button
          type="button"
          aria-describedby="generate-bar-hint"
          onClick={onClick}
          disabled={disabled}
          className="button-primary min-h-11 shrink-0 px-4 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
