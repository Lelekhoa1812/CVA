// Auto Apply pipeline state machine. A job candidate moves through these stages; every route that changes a stage
// calls `assertTransition` so the pipeline can never jump (for example from "discovered" straight to "applied").

export const JOB_STAGES = [
  "discovered",
  "shortlisted",
  "selected",
  "preparing",
  "needs_input",
  "prepared",
  "approved",
  "applied",
  "skipped",
  "failed",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

// Values written by the previous engine, mapped onto the current stages when read.
const LEGACY_STAGES: Record<string, JobStage> = {
  ready_for_review: "prepared",
  submitted: "applied",
  manual_apply_recommended: "discovered",
};

export function normalizeStage(value: string | undefined | null): JobStage {
  if (!value) return "discovered";
  if ((JOB_STAGES as readonly string[]).includes(value)) return value as JobStage;
  return LEGACY_STAGES[value] || "discovered";
}

const TRANSITIONS: Record<JobStage, JobStage[]> = {
  discovered: ["shortlisted", "selected", "skipped", "preparing"],
  shortlisted: ["selected", "skipped", "discovered", "preparing"],
  selected: ["preparing", "skipped", "shortlisted", "discovered"],
  preparing: ["prepared", "needs_input", "failed", "selected"],
  needs_input: ["prepared", "preparing", "skipped"],
  prepared: ["approved", "needs_input", "preparing", "skipped"],
  approved: ["applied", "prepared", "preparing"],
  applied: ["approved"],
  skipped: ["selected", "shortlisted", "discovered"],
  failed: ["preparing", "selected", "skipped"],
};

export function canTransition(from: JobStage, to: JobStage) {
  return from === to || TRANSITIONS[from].includes(to);
}

export class TransitionError extends Error {
  constructor(readonly from: JobStage, readonly to: JobStage) {
    super(`Cannot move an application from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`);
  }
}

export function assertTransition(from: string, to: JobStage) {
  const current = normalizeStage(from);
  if (!canTransition(current, to)) throw new TransitionError(current, to);
  return current;
}

/** Stages that represent a job the user (or autopilot) has committed to applying for. */
export const ACTIVE_STAGES = new Set<JobStage>(["selected", "preparing", "needs_input", "prepared", "approved", "applied"]);

/** A preparing lock older than this is considered abandoned (the serverless request died) and can be retried. */
export const PREPARE_LOCK_MS = 4 * 60_000;

export type PipelineCounts = Record<JobStage, number> & { total: number };

export function countStages(stages: string[]): PipelineCounts {
  const counts = Object.fromEntries(JOB_STAGES.map((stage) => [stage, 0])) as PipelineCounts;
  counts.total = stages.length;
  for (const stage of stages) counts[normalizeStage(stage)] += 1;
  return counts;
}

export type SessionPhase = "setup" | "searching" | "scoring" | "preparing" | "review" | "apply" | "done" | "failed";

/** Derive what the session needs next from its run phase and job stage counts. */
export function deriveSessionPhase(runPhase: string | undefined, counts: PipelineCounts): SessionPhase {
  if (runPhase === "searching" || runPhase === "scoring" || runPhase === "preparing" || runPhase === "failed") {
    return runPhase;
  }
  if (!counts.total) return "setup";
  if (counts.preparing) return "preparing";
  if (counts.prepared || counts.needs_input) return "review";
  if (counts.approved) return "apply";
  if (counts.applied && !counts.selected) return "done";
  return "review";
}

export function remainingApplicationSlots(limit: number, counts: PipelineCounts) {
  const committed = counts.preparing + counts.needs_input + counts.prepared + counts.approved + counts.applied + counts.selected;
  return Math.max(0, limit - committed);
}

/** Fills fields that records created before the engine rewrite do not have, so clients can rely on the shape. */
export function withJobDefaults<T extends Record<string, unknown>>(job: T) {
  const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : []);
  return {
    ...job,
    fitScore: typeof job.fitScore === "number" ? job.fitScore : 0,
    fitVerdict: (job.fitVerdict as string) || "",
    scoredBy: (job.scoredBy as string) || "heuristic",
    fitReasons: list(job.fitReasons),
    fitGaps: list(job.fitGaps),
    riskFlags: list(job.riskFlags),
    formSource: (job.formSource as string) || "",
  };
}
