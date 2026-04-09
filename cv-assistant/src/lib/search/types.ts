export const SEARCH_SOURCES = ["linkedin", "seek", "indeed"] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const POSTED_WITHIN_OPTIONS = ["any", "24h", "3d", "7d", "14d", "30d"] as const;
export type PostedWithin = (typeof POSTED_WITHIN_OPTIONS)[number];

export const WORKPLACE_MODE_OPTIONS = ["any", "remote", "hybrid", "onsite"] as const;
export type WorkplaceMode = (typeof WORKPLACE_MODE_OPTIONS)[number];

export const EMPLOYMENT_TYPE_OPTIONS = [
  "any",
  "full-time",
  "part-time",
  "contract",
  "internship",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE_OPTIONS)[number];

export const MAX_RESULTS_OPTIONS = [25, 50, 100] as const;
export type MaxResultsPerSource = (typeof MAX_RESULTS_OPTIONS)[number];

export type SearchFilters = {
  postedWithin: PostedWithin;
  workplaceMode: WorkplaceMode;
  employmentType: EmploymentType;
};

export type SearchRequest = {
  jobTitle: string;
  location: string;
  filters: SearchFilters;
  maxResultsPerSource: MaxResultsPerSource;
};

export type ApplicationUrlType = "external" | "board-detail" | "listing";
export type SearchQueryMatch = "strong" | "partial";
export type SourceProgressStatus = "pending" | "running" | "complete" | "blocked" | "error";

export type JobSearchResult = {
  id: string;
  source: SearchSource;
  title: string;
  company: string;
  location: string;
  postedText: string;
  snippet: string;
  listingUrl: string;
  applicationUrl: string;
  applicationUrlType: ApplicationUrlType;
  searchQueryMatch: SearchQueryMatch;
  dedupeKey: string;
};

export type SourceProgressEvent = {
  type: "source-progress";
  source: SearchSource;
  status: SourceProgressStatus;
  pagesScanned: number;
  resultsFound: number;
  message?: string;
  blockedReason?: string;
};

export type StatusEvent = {
  type: "status";
  phase: "starting" | "running" | "finished";
  message: string;
};

export type ResultEvent = {
  type: "result";
  result: JobSearchResult;
};

export type CompleteEvent = {
  type: "complete";
  totalResults: number;
  blockedSources: SearchSource[];
  elapsedMs: number;
};

export type ErrorEvent = {
  type: "error";
  message: string;
  source?: SearchSource;
  fatal?: boolean;
};

export type SearchStreamEvent =
  | StatusEvent
  | SourceProgressEvent
  | ResultEvent
  | CompleteEvent
  | ErrorEvent;

export type SourceProgressState = Omit<SourceProgressEvent, "type">;

export const SOURCE_LABELS: Record<SearchSource, string> = {
  linkedin: "LinkedIn",
  seek: "SEEK",
  indeed: "Indeed",
};

export function createInitialSourceProgress(): Record<SearchSource, SourceProgressState> {
  return {
    linkedin: {
      source: "linkedin",
      status: "pending",
      pagesScanned: 0,
      resultsFound: 0,
      message: "Queued",
    },
    seek: {
      source: "seek",
      status: "pending",
      pagesScanned: 0,
      resultsFound: 0,
      message: "Queued",
    },
    indeed: {
      source: "indeed",
      status: "pending",
      pagesScanned: 0,
      resultsFound: 0,
      message: "Queued",
    },
  };
}
