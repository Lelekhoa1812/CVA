from __future__ import annotations

import json
import sys
import time

import requests

from search.models import SEARCH_SOURCES, SearchRequest, SearchSource
from search.sources import crawl_source
from search.utils import canonicalize_url, passes_post_filters


def emit(event: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
            ),
            "Accept-Language": "en-AU,en;q=0.9",
        }
    )
    return session


def main() -> int:
    payload = json.loads(sys.stdin.read() or "{}")
    request = SearchRequest.from_dict(payload)
    session = build_session()

    start_time = time.monotonic()
    seen_urls: set[str] = set()
    seen_dedupe_keys: set[str] = set()
    blocked_sources: list[SearchSource] = []
    total_results = 0

    def emit_progress(
        source: SearchSource,
        status: str,
        pages_scanned: int,
        results_found: int,
        message: str | None,
        blocked_reason: str | None,
    ) -> None:
        if status == "blocked" and source not in blocked_sources:
            blocked_sources.append(source)

        event = {
            "type": "source-progress",
            "source": source,
            "status": status,
            "pagesScanned": pages_scanned,
            "resultsFound": results_found,
        }
        if message:
            event["message"] = message
        if blocked_reason:
            event["blockedReason"] = blocked_reason
        emit(event)

    emit(
        {
            "type": "status",
            "phase": "starting",
            "message": f'Searching for "{request.jobTitle}" in "{request.location}".',
        }
    )

    # Motivation vs Logic:
    # Motivation: The UI needs one coherent live stream even though each board has different markup,
    # filtering support, and failure modes.
    # Logic: Centralize orchestration here so source adapters only return normalized candidates while the
    # coordinator owns post-filtering, dedupe, blocked-source accounting, and event emission.
    for source in SEARCH_SOURCES:
        try:
            for result in crawl_source(source, request, session, emit_progress):
                if not passes_post_filters(result, request.filters):
                    continue

                canonical_listing = canonicalize_url(result.listingUrl)
                canonical_application = canonicalize_url(result.applicationUrl)
                if result.dedupeKey in seen_dedupe_keys:
                    continue
                if canonical_listing and canonical_listing in seen_urls:
                    continue
                if canonical_application and canonical_application in seen_urls:
                    continue

                seen_dedupe_keys.add(result.dedupeKey)
                if canonical_listing:
                    seen_urls.add(canonical_listing)
                if canonical_application:
                    seen_urls.add(canonical_application)

                total_results += 1
                emit({"type": "result", "result": result.to_payload()})
        except Exception as error:  # noqa: BLE001
            emit(
                {
                    "type": "error",
                    "message": f"{source.upper()} failed: {str(error).strip() or 'Unknown error.'}",
                    "source": source,
                }
            )

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    emit({"type": "status", "phase": "finished", "message": "Search finished."})
    emit(
        {
            "type": "complete",
            "totalResults": total_results,
            "blockedSources": blocked_sources,
            "elapsedMs": elapsed_ms,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
