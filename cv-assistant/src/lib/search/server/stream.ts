import type {
  SearchRequest,
  SearchSource,
  SearchStreamEvent,
  SourceProgressEvent,
} from "@/lib/search/types";
import { passesPostFilters, canonicalizeUrl } from "@/lib/search/server/utils";
import { crawlBlockProneSource, crawlLinkedIn } from "@/lib/search/server/sources";

type StreamOptions = {
  signal?: AbortSignal;
};

export async function* streamSearchJobs(
  request: SearchRequest,
  options: StreamOptions = {},
): AsyncGenerator<SearchStreamEvent> {
  const startedAt = Date.now();
  const blockedSources = new Set<SearchSource>();
  const seenUrls = new Set<string>();
  const seenDedupeKeys = new Set<string>();
  let totalResults = 0;

  const progressQueue: SourceProgressEvent[] = [];
  const emitProgress = (event: SourceProgressEvent) => {
    if (event.status === "blocked") {
      blockedSources.add(event.source);
    }
    progressQueue.push(event);
  };

  const flushProgress = async function* () {
    while (progressQueue.length > 0) {
      yield progressQueue.shift() as SourceProgressEvent;
    }
  };

  yield {
    type: "status",
    phase: "starting",
    message: `Searching for "${request.jobTitle}" in "${request.location}".`,
  };

  // Motivation vs Logic:
  // Motivation: The UI needs a single live stream even though each source has different markup, filter support,
  // and failure behavior in public HTML mode.
  // Logic: Centralize orchestration here so source adapters only fetch and normalize candidates while this stream
  // layer owns post-filtering, dedupe, blocked-source accounting, and the incremental event contract used by the page.
  const sources: Array<SearchSource> = ["linkedin", "seek", "indeed"];
  for (const source of sources) {
    options.signal?.throwIfAborted?.();

    try {
      const iterator =
        source === "linkedin"
          ? crawlLinkedIn({ request, signal: options.signal, emitProgress })
          : crawlBlockProneSource({
              source,
              request,
              signal: options.signal,
              emitProgress,
            });

      for await (const result of iterator) {
        yield* flushProgress();

        if (!passesPostFilters(result, request.filters)) {
          continue;
        }

        const canonicalListing = canonicalizeUrl(result.listingUrl);
        const canonicalApplication = canonicalizeUrl(result.applicationUrl);
        if (seenDedupeKeys.has(result.dedupeKey)) {
          continue;
        }
        if (canonicalListing && seenUrls.has(canonicalListing)) {
          continue;
        }
        if (canonicalApplication && seenUrls.has(canonicalApplication)) {
          continue;
        }

        seenDedupeKeys.add(result.dedupeKey);
        if (canonicalListing) seenUrls.add(canonicalListing);
        if (canonicalApplication) seenUrls.add(canonicalApplication);

        totalResults += 1;
        yield { type: "result", result };
      }

      yield* flushProgress();
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      yield {
        type: "error",
        message: `${source.toUpperCase()} failed: ${error instanceof Error ? error.message : "Unknown error."}`,
        source,
      };
    }
  }

  yield { type: "status", phase: "finished", message: "Search finished." };
  yield {
    type: "complete",
    totalResults,
    blockedSources: [...blockedSources],
    elapsedMs: Date.now() - startedAt,
  };
}
