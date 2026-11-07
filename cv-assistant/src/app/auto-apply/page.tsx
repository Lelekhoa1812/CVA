"use client";

import { useEffect } from "react";
import ActivityRail from "@/components/auto-apply/ActivityRail";
import ApplyStep from "@/components/auto-apply/ApplyStep";
import BriefStep from "@/components/auto-apply/BriefStep";
import MatchesStep from "@/components/auto-apply/MatchesStep";
import ReviewStep from "@/components/auto-apply/ReviewStep";
import Stepper from "@/components/auto-apply/Stepper";
import { Spinner } from "@/components/auto-apply/ui";
import { useAutoApply } from "@/components/auto-apply/useAutoApply";
import GlassPanel from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";

export default function AutoApplyPage() {
  const c = useAutoApply();
  const counts = c.data?.counts;
  const reviewCount = (counts?.prepared || 0) + (counts?.needs_input || 0);
  const applyCount = (counts?.approved || 0) + (counts?.applied || 0);

  // Auto-dismiss success/info toasts; errors stay until dismissed.
  const { notice, setNotice } = c;
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = window.setTimeout(() => setNotice((current) => (current?.id === notice.id ? null : current)), 5000);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  const steps = [
    { id: "brief" as const, label: "Brief", hint: "Role and standing answers", enabled: true, done: Boolean(c.activeId) },
    { id: "matches" as const, label: "Matches", hint: "Ranked roles", count: counts?.total || undefined, enabled: c.steps.matches || c.running, done: c.steps.review },
    { id: "review" as const, label: "Review", hint: "Answers and cover letters", count: reviewCount || undefined, enabled: c.steps.review, done: c.steps.apply },
    { id: "apply" as const, label: "Apply", hint: "Open and autofill", count: applyCount || undefined, enabled: c.steps.apply, done: Boolean(counts?.applied && counts.applied === applyCount) },
  ];

  return (
    <main className="page-shell space-y-5">
      <GlassPanel strong className="p-4 sm:p-6" as="header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="section-kicker">Application assistant</p>
            <h1 className="text-foreground font-display text-3xl leading-tight sm:text-4xl">Auto Apply</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              Find roles, read each employer&apos;s real application form, and get complete, tailored applications prepared for you.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              ["Roles found", counts?.total || 0],
              ["Ready", (counts?.prepared || 0) + (counts?.approved || 0)],
              ["Applied", counts?.applied || 0],
            ].map(([label, value]) => (
              <div key={label} className="surface-subtle rounded-2xl px-3 py-2 text-center sm:min-w-28 sm:px-4 sm:py-3">
                <dd className="text-foreground text-xl font-semibold leading-none sm:text-2xl">{value}</dd>
                <dt className="text-muted-foreground mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </GlassPanel>

      <Stepper steps={steps} current={c.step} onSelect={c.setStep} />

      {notice ? (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn("status-chip !flex !items-start !justify-between !gap-3 !rounded-2xl !px-4 !py-3 !text-sm !font-medium", notice.kind === "error" ? "status-danger" : notice.kind === "success" ? "status-success" : "status-info")}
        >
          <span className="break-words">{notice.message}</span>
          <button type="button" className="min-h-8 shrink-0 text-xs font-semibold underline underline-offset-4" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassPanel className="min-w-0 p-4 sm:p-6" as="section">
          {c.loading ? (
            <div className="text-muted-foreground flex items-center gap-3 py-10 text-sm" aria-busy="true">
              <Spinner /> Loading your workspace…
            </div>
          ) : c.step === "brief" ? (
            <BriefStep c={c} />
          ) : c.step === "matches" ? (
            <MatchesStep c={c} />
          ) : c.step === "review" ? (
            <ReviewStep c={c} />
          ) : (
            <ApplyStep c={c} />
          )}
        </GlassPanel>
        <div className="xl:sticky xl:top-24 xl:self-start">
          <ActivityRail c={c} />
        </div>
      </div>
    </main>
  );
}
