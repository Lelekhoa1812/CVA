import { AUTOMATIC_RETRY_MESSAGE } from "@/lib/search/retry";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  SEARCH_SOURCES,
  SOURCE_LABELS,
  WORKPLACE_MODE_OPTIONS,
  type EmploymentType,
  type PostedWithin,
  type SearchSource,
  type SourceProgressState,
  type WorkplaceMode,
} from "@/lib/search/types";

export { AUTOMATIC_RETRY_MESSAGE };

export const postedLabels: Record<(typeof POSTED_WITHIN_OPTIONS)[number], string> = {
  any: "Any time",
  "24h": "Past 24 hours",
  "3d": "Past 3 days",
  "7d": "Past 7 days",
  "14d": "Past 14 days",
  "30d": "Past 30 days",
};

export const workplaceLabels: Record<(typeof WORKPLACE_MODE_OPTIONS)[number], string> = {
  any: "Any workplace",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const employmentLabels: Record<(typeof EMPLOYMENT_TYPE_OPTIONS)[number], string> = {
  any: "Any employment type",
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
};

export const MATCH_FILTER_OPTIONS = ["any", "strong", "partial"] as const;
export type MatchFilter = (typeof MATCH_FILTER_OPTIONS)[number];
export const matchLabels: Record<MatchFilter, string> = {
  any: "Any match",
  strong: "Strong matches only",
  partial: "Partial matches only",
};

export type PlatformFilter = SearchSource | "any";
export const PLATFORM_FILTER_OPTIONS: PlatformFilter[] = ["any", ...SEARCH_SOURCES];
export const platformLabels: Record<PlatformFilter, string> = {
  any: "Any platform",
  ...SOURCE_LABELS,
};

export type ResultFilters = {
  match: MatchFilter;
  platform: PlatformFilter;
  postedWithin: PostedWithin;
  workplaceMode: WorkplaceMode;
  employmentType: EmploymentType;
};

export type SourceVisualStatus = "pending" | "running" | "retrying" | "complete" | "blocked" | "error";

export function isAutomaticRetry(progress: Pick<SourceProgressState, "status" | "message">) {
  return progress.status === "running" && progress.message === AUTOMATIC_RETRY_MESSAGE;
}

export function sourceVisualStatus(progress: Pick<SourceProgressState, "status" | "message">): SourceVisualStatus {
  if (isAutomaticRetry(progress)) return "retrying";
  return progress.status;
}

export function sourceVisualLabel(status: SourceVisualStatus) {
  if (status === "pending") return "Pending";
  if (status === "running") return "Running";
  if (status === "retrying") return "Retrying";
  if (status === "complete") return "Complete";
  if (status === "blocked") return "Blocked";
  return "Error";
}

export function sourceVisualClass(status: SourceVisualStatus) {
  if (status === "complete") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-800 dark:text-emerald-100";
  if (status === "blocked") return "border-amber-400/35 bg-amber-400/10 text-amber-800 dark:text-amber-100";
  if (status === "error") return "border-rose-400/25 bg-rose-400/10 text-rose-800 dark:text-rose-100";
  if (status === "retrying") return "border-[hsl(var(--accent)/0.45)] bg-[hsl(var(--accent)/0.14)] text-foreground";
  if (status === "running") return "border-sky-400/35 bg-sky-400/10 text-sky-800 dark:text-sky-100";
  return "border-border/80 bg-[hsl(var(--surface-1)/0.72)] text-muted-foreground";
}
