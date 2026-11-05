import type {
  SearchRequest,
  SearchSource,
  SearchStreamEvent,
  SourceProgressEvent,
} from "@/lib/search/types";
import { passesPostFilters } from "@/lib/search/filters";
import { AUTOMATIC_RETRY_MESSAGE } from "@/lib/search/retry";
import { crawlBlockProneSource, crawlLinkedIn } from "@/lib/search/server/sources";

export { AUTOMATIC_RETRY_MESSAGE };

type StreamOptions = {
  signal?: AbortSignal;
};

const SOURCE_ERROR_RETRIES = 2;
const SOURCE_RETRY_DELAYS_MS = [600, 1200];

function safeErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const httpStatus = message.match(/HTTP (\d{3})/i)?.[1];
  return httpStatus ? `HTTP ${httpStatus}` : "Connection failed";
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

function readNext<T>(iterator: AsyncIterator<T>) {
  return iterator.next().then(
    (result) => ({ type: "result" as const, result }),
    (error: unknown) => ({ type: "error" as const, error }),
  );
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("Search aborted."));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Search aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function* streamSearchJobs(
  request: SearchRequest,
  options: StreamOptions = {},
): AsyncGenerator<SearchStreamEvent> {
  const startedAt = Date.now();
  const blockedSources = new Set<SearchSource>();
  const seenDedupeKeys = new Set<string>();
  let totalResults = 0;
  const deliveredProgressCounts = new Map<SearchSource, number>();

  const progressQueue: SourceProgressEvent[] = [];
  const progressWaiters = new Set<() => void>();
  const emitProgress = (event: SourceProgressEvent) => {
    if (event.status === "blocked") {
      blockedSources.add(event.source);
    }
    progressQueue.push(event);
    for (const resolve of progressWaiters) resolve();
    progressWaiters.clear();
  };

  const waitForProgress = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
      progressWaiters.add(done);
    });
    return {
      promise,
      cancel: () => progressWaiters.delete(resolve),
    };
  };

  const flushProgress = async function* () {
    while (progressQueue.length > 0) {
      const event = progressQueue.shift() as SourceProgressEvent;
      deliveredProgressCounts.set(event.source, event.resultsFound);
      yield event;
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
  // layer owns post-filtering, exact per-card dedupe, blocked-source accounting, and the incremental event contract
  // used by the page. Cross-platform duplicates stay visible because they now share only `duplicateGroupKey` metadata.
  const sources = request.selectedSources;
  for (const source of sources) {
    options.signal?.throwIfAborted?.();

    let completed = false;
    let highestPagesScanned = 0;
    let uniqueResultsFound = 0;
    for (let attempt = 0; attempt <= SOURCE_ERROR_RETRIES && !completed; attempt += 1) {
      let pagesScanned = 0;
      const emitAttemptProgress = (event: SourceProgressEvent) => {
        pagesScanned = Math.max(pagesScanned, event.pagesScanned);
        highestPagesScanned = Math.max(highestPagesScanned, pagesScanned);
        emitProgress({
          ...event,
          pagesScanned: highestPagesScanned,
          resultsFound: uniqueResultsFound,
        });
      };
      try {
        const iterator =
          source === "linkedin"
            ? crawlLinkedIn({ request, signal: options.signal, emitProgress: emitAttemptProgress })
            : crawlBlockProneSource({
                source,
                request,
                signal: options.signal,
                emitProgress: emitAttemptProgress,
              });

        let nextResult = readNext(iterator);
        while (true) {
          if (progressQueue.length > 0) {
            yield* flushProgress();
          }

          const progressWaiter = waitForProgress();
          const outcome = await Promise.race([
            nextResult,
            progressWaiter.promise.then(() => ({ type: "progress" as const })),
          ]);
          progressWaiter.cancel();

          if (outcome.type === "progress") continue;
          if (outcome.type === "error") throw outcome.error;
          if (outcome.result.done) break;
          const result = outcome.result.value;

          if (!passesPostFilters(result, request.filters)) {
            nextResult = readNext(iterator);
            continue;
          }

          if (uniqueResultsFound >= request.maxResultsPerSource) {
            nextResult = readNext(iterator);
            continue;
          }

          if (seenDedupeKeys.has(result.dedupeKey)) {
            nextResult = readNext(iterator);
            continue;
          }

          seenDedupeKeys.add(result.dedupeKey);
          uniqueResultsFound += 1;

          const pendingSourceProgress = progressQueue.filter((event) => event.source === source);
          if (pendingSourceProgress.length > 0) {
            for (const event of pendingSourceProgress) event.resultsFound = uniqueResultsFound;
          } else if ((deliveredProgressCounts.get(source) ?? 0) < uniqueResultsFound) {
            emitProgress({
              type: "source-progress",
              source,
              status: "running",
              pagesScanned: highestPagesScanned,
              resultsFound: uniqueResultsFound,
              message: "Streaming matches.",
            });
          }
          yield* flushProgress();

          totalResults += 1;
          yield { type: "result", result };
          nextResult = readNext(iterator);
        }

        yield* flushProgress();
        completed = true;
      } catch (error) {
        if (isAbortError(error, options.signal)) {
          throw error;
        }
        highestPagesScanned = Math.max(highestPagesScanned, pagesScanned);
        if (attempt < SOURCE_ERROR_RETRIES) {
          emitProgress({
            type: "source-progress",
            source,
            status: "running",
            pagesScanned: highestPagesScanned,
            resultsFound: uniqueResultsFound,
            message: AUTOMATIC_RETRY_MESSAGE,
          });
          yield* flushProgress();
          await waitForRetry(SOURCE_RETRY_DELAYS_MS[attempt] ?? 1200, options.signal);
          continue;
        }
        emitProgress({
          type: "source-progress",
          source,
          status: "error",
          pagesScanned: highestPagesScanned,
          resultsFound: uniqueResultsFound,
          message: `Source failed after automatic retries: ${safeErrorSummary(error)}`,
        });
        yield* flushProgress();
        yield {
          type: "error",
          message: `${source.toUpperCase()} failed after retry: ${error instanceof Error ? error.message : "Unknown error."}`,
          source,
        };
      }
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
