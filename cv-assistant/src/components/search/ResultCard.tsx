import { SOURCE_LABELS, type ApplicationUrlType, type JobSearchResult, type SearchQueryMatch } from "@/lib/search/types";

const applicationLabels: Record<ApplicationUrlType, string> = {
  external: "External apply",
  "board-detail": "Board listing",
  listing: "Listing page",
};

const matchLabels: Record<SearchQueryMatch, string> = {
  strong: "Strong match",
  partial: "Partial match",
};

type ResultCardProps = {
  result: JobSearchResult;
  duplicateCount: number;
  archived: boolean;
  onToggleArchive: (duplicateGroupKey: string) => void;
};

function formatDuplicateLabel(count: number) {
  return count > 1 ? `${count} linked duplicates` : "Unique card";
}

export default function ResultCard({ result, duplicateCount, archived, onToggleArchive }: ResultCardProps) {
  return (
    <article className="interactive-card min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="metric-chip">{SOURCE_LABELS[result.source]}</span>
        <span className="metric-chip">{applicationLabels[result.applicationUrlType]}</span>
        <span className="metric-chip">{matchLabels[result.searchQueryMatch]}</span>
        <span className="metric-chip">{formatDuplicateLabel(duplicateCount)}</span>
      </div>

      <div className="mt-4 min-w-0 space-y-2">
        <h3 className="text-foreground break-words font-display text-xl sm:text-2xl">{result.title}</h3>
        {/* Motivation vs Logic:
            Motivation: Search result cards should not shift when source data is missing so users can scan faster.
            Logic: Always render placeholder text for both company and location (with the separator) so each card stays visually consistent. */}
        <p className="text-muted-foreground break-words text-sm">
          {result.company || "Company TBD"} • {result.location || "Location TBD"}
        </p>
        <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
          {result.postedText || "Posted time unavailable"}
        </p>
      </div>

      <p className="text-muted-foreground mt-3 break-words text-sm leading-6">
        {result.snippet || "No snippet was publicly exposed for this listing."}
      </p>

      <div className="mt-5 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a href={result.applicationUrl} target="_blank" rel="noreferrer" className="button-primary min-h-11">
          Open application URL
        </a>
        <a href={result.listingUrl} target="_blank" rel="noreferrer" className="button-secondary min-h-11">
          Open listing page
        </a>
        {duplicateCount > 1 ? (
          <button
            className="button-secondary min-h-11"
            type="button"
            onClick={() => onToggleArchive(result.duplicateGroupKey)}
          >
            {archived ? "Unarchive linked duplicates" : "Archive linked duplicates"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
