"use client";

import type { ReactNode } from "react";

type HoverTooltipProps = {
  children: ReactNode;
  message: string;
};

export default function HoverTooltip({ children, message }: HoverTooltipProps) {
  /* Motivation vs Logic:
     Motivation: the new Explore action needs an inline explanation on hover so users understand it writes from existing profile evidence rather than generic AI filler.
     Logic: keep one tiny, reusable hover/focus tooltip wrapper so any button can opt into the same accessible help pattern without duplicating absolute-positioned markup. */
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-[hsl(var(--surface-1)/0.97)] px-3 py-2 text-left text-xs leading-5 text-foreground opacity-0 shadow-2xl transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {message}
      </span>
    </span>
  );
}
