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
};

export default function ModuleShell({
  eyebrow,
  title,
  description,
  stats = [],
  aside,
  children,
  className,
}: ModuleShellProps) {
  return (
    <div className={cn("page-shell", className)}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <GlassPanel strong className="hero-card overflow-hidden p-7 sm:p-10">
          {/* Motivation: every module needs a strong editorial opening to feel premium and to orient the user quickly.
              Logic: centralize the hero treatment here so Profile, Resume, and Cover Letter all share the same high-end shell. */}
          {/* Root Cause: the module shell used fixed white and slate copy tokens that disappeared against the light palette.
              Logic: switch shared hero typography and stat cards to theme-aware tokens so every module stays legible in both themes. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(183,163,255,0.16),transparent_35%)]" />
          <div className="relative space-y-5">
            <p className="section-kicker">{eyebrow}</p>
            <div className="max-w-3xl space-y-4">
              <h1 className="text-foreground font-display text-4xl leading-[1.02] sm:text-5xl xl:text-6xl">
                {title}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-base leading-8 sm:text-lg">
                {description}
              </p>
            </div>
            {stats.length ? (
              <div className="grid gap-3 pt-4 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="surface-subtle rounded-2xl px-4 py-4"
                  >
                    <div className="text-foreground text-2xl font-semibold">{stat.value}</div>
                    <div className="text-muted-foreground mt-1 text-xs uppercase tracking-[0.24em]">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        {aside ? (
          <GlassPanel className="relative overflow-hidden p-6 sm:p-7">{aside}</GlassPanel>
        ) : null}
      </section>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
