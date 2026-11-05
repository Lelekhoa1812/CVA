import { SOURCE_LABELS, type SearchSource, type SourceProgressState } from "@/lib/search/types";
import { cn } from "@/lib/utils";
import { sourceVisualClass, sourceVisualLabel, sourceVisualStatus } from "@/components/search/labels";

type SourceRailProps = {
  sources: SearchSource[];
  sourceProgress: Record<SearchSource, SourceProgressState>;
  isSearching: boolean;
  statusMessage: string;
  summary: { totalResults: number; elapsedMs: number } | null;
};

function sourceProgressCopy(visual: ReturnType<typeof sourceVisualStatus>, message?: string) {
  if (visual === "retrying") return "Trying this platform again. Matches already found stay listed.";
  if (visual === "error") return "This platform stopped after automatic retries. The other platforms continued.";
  return message || "Queued";
}

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

export default function SourceRail({
  sources,
  sourceProgress,
  isSearching,
  statusMessage,
  summary,
}: SourceRailProps) {
  const headline = isSearching ? "Searching" : summary ? "Finished" : "Ready";

  return (
    <div className="min-w-0 space-y-4">
      <div className="surface-subtle min-w-0 rounded-2xl p-4" role="status" aria-live="polite" aria-atomic="true">
        <p className="section-kicker">Live</p>
        <h2 className="text-foreground font-display mt-2 text-2xl">{headline}</h2>
        <p className="text-muted-foreground mt-2 break-words text-sm leading-6">{statusMessage}</p>
        {summary ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Finished in <span className="text-foreground font-semibold">{formatElapsed(summary.elapsedMs)}</span>
            {" with "}
            <span className="text-foreground font-semibold">{summary.totalResults}</span> results.
          </p>
        ) : null}
      </div>

      <ul className="grid min-w-0 gap-2">
        {sources.map((source) => {
          const progress = sourceProgress[source];
          const visual = sourceVisualStatus(progress);
          return (
            <li
              key={source}
              className={cn("min-w-0 rounded-2xl border px-3 py-2.5", sourceVisualClass(visual))}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full bg-current",
                      visual === "retrying" && "motion-safe:animate-pulse",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-semibold">{SOURCE_LABELS[source]}</span>
                </span>
                <span className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">
                  {sourceVisualLabel(visual)}
                </span>
              </div>
              <p className="mt-1 break-words text-xs leading-5 opacity-80">
                {progress.pagesScanned} {progress.pagesScanned === 1 ? "page" : "pages"}
                {" · "}
                {progress.resultsFound} {progress.resultsFound === 1 ? "match" : "matches"}
              </p>
              <p className="mt-1 break-words text-xs leading-5 opacity-80">{sourceProgressCopy(visual, progress.message)}</p>
              {progress.message && progress.blockedReason ? (
                <p className="mt-1 break-words text-xs leading-5 opacity-80">{progress.blockedReason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
