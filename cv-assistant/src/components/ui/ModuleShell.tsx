import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import GlassPanel from "./GlassPanel";

type Stat = {
  label: string;
  value: string;
};

type ModuleShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  stats?: Stat[];
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  compactMobile?: boolean;
};

export default function ModuleShell({
  eyebrow,
  title,
  description,
  stats = [],
  aside,
  children,
  className,
  compactMobile = false,
}: ModuleShellProps) {
  return (
    <div className={cn("page-shell", className)}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <GlassPanel strong className={cn("hero-card overflow-hidden p-7 sm:p-10", compactMobile && "p-5 sm:p-10")}>
          {/* Motivation: every module needs a strong editorial opening to feel premium and to orient the user quickly.
              Logic: centralize the hero treatment here so Profile, Resume, and Cover Letter all share the same high-end shell. */}
          {/* Root Cause: the module shell used fixed white and slate copy tokens that disappeared against the light palette.
              Logic: switch shared hero typography and stat cards to theme-aware tokens so every module stays legible in both themes. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(183,163,255,0.16),transparent_35%)]" />
          <div className="relative space-y-5">
            <p className="section-kicker">{eyebrow}</p>
            <div className="max-w-3xl space-y-4">
              <h1 className={cn("text-foreground font-display text-4xl leading-[1.02] sm:text-5xl xl:text-6xl", compactMobile && "text-3xl sm:text-5xl")}>
                {title}
              </h1>
              <p className={cn("text-muted-foreground max-w-2xl text-base leading-8 sm:text-lg", compactMobile && "text-sm leading-6 sm:text-lg sm:leading-8")}>
                {description}
              </p>
            </div>
            {stats.length ? (
              <div className={cn("grid gap-3 pt-4 sm:grid-cols-3", compactMobile && "grid-cols-3 gap-2 pt-0 sm:gap-3 sm:pt-4")}>
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className={cn("surface-subtle rounded-2xl px-4 py-4", compactMobile && "px-2 py-2 sm:px-4 sm:py-4")}
                  >
                    <div className={cn("text-foreground text-2xl font-semibold", compactMobile && "text-sm sm:text-2xl")}>{stat.value}</div>
                    <div className={cn("text-muted-foreground mt-1 text-xs uppercase tracking-[0.24em]", compactMobile && "text-[10px] tracking-normal sm:text-xs sm:tracking-[0.24em]")}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        {aside ? (
          compactMobile ? (
            <>
              <details className="glass-panel rounded-[1.5rem] p-4 sm:hidden">
                <summary className="cursor-pointer text-sm font-semibold">Tips and guidance</summary>
                <div className="pt-4">{aside}</div>
              </details>
              <GlassPanel className="relative hidden overflow-hidden p-6 sm:block sm:p-7">{aside}</GlassPanel>
            </>
          ) : <GlassPanel className="relative overflow-hidden p-6 sm:p-7">{aside}</GlassPanel>
        ) : null}
      </section>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
