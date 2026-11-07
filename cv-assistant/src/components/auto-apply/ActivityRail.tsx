"use client";

import { Chip, EmptyState, Spinner, timeAgo } from "./ui";
import type { AutoApplyController } from "./useAutoApply";

const EVENT_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  draft_ready: "success",
  applied: "success",
  approved: "success",
  needs_input: "warning",
  prepare_failed: "danger",
  run_failed: "danger",
};

export default function ActivityRail({ c }: { c: AutoApplyController }) {
  const run = c.data?.session.run;
  const stats = run?.stats || {};
  return (
    <aside aria-label="Activity" className="space-y-4">
      <div role="status" aria-live="polite" className="surface-subtle rounded-2xl p-4">
        <div className="flex items-center gap-2">
          {c.running ? <Spinner className="text-primary" /> : <span className="status-dot" aria-hidden="true" />}
          <p className="text-foreground text-sm font-semibold">{c.running ? "Working" : "Status"}</p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{run?.message || (c.activeId ? "Idle" : "Describe a role to begin.")}</p>
        {c.running && (stats.found || stats.toPrepare) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.found ? <Chip tone="info">{stats.found} roles</Chip> : null}
            {stats.employerForms ? <Chip tone="success">{stats.employerForms} employer forms</Chip> : null}
            {stats.llmScored ? <Chip tone="info">{stats.llmScored} scored</Chip> : null}
            {stats.toPrepare ? <Chip tone="neutral">{(stats.prepared || 0) + (stats.needsInput || 0) + (stats.failed || 0)}/{stats.toPrepare} prepared</Chip> : null}
          </div>
        ) : null}
        {c.running ? (
          <button type="button" onClick={() => void c.cancel()} className="button-secondary mt-4 min-h-11 w-full">
            Stop
          </button>
        ) : null}
      </div>

      <div className="surface-subtle rounded-2xl p-4">
        <p className="text-foreground text-sm font-semibold">Activity</p>
        {c.data?.events.length ? (
          <ol tabIndex={0} aria-label="Activity events" className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {[...c.data.events].reverse().map((event) => (
              <li key={event._id} className="text-sm leading-5">
                <div className="flex items-start gap-2">
                  <span className={`status-chip status-${EVENT_TONE[event.type] || "neutral"} mt-0.5 !h-2 !w-2 shrink-0 !p-0`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-foreground break-words">{event.message}</p>
                    <p className="text-muted-foreground text-xs">{timeAgo(event.createdAt)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm leading-6">Search progress and application events appear here.</p>
        )}
      </div>
    </aside>
  );
}

export { EmptyState };
