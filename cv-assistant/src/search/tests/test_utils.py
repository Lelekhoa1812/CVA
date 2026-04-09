from __future__ import annotations

import unittest

from search.models import JobSearchResult, SearchFilters
from search.utils import (
    build_dedupe_key,
    canonicalize_url,
    detect_blocked_page,
    parse_posted_age_days,
    passes_post_filters,
)


def make_result(**overrides: str) -> JobSearchResult:
    result = JobSearchResult(
        id="1",
        source="linkedin",
        title="Senior Software Engineer",
        company="Acme",
        location="Melbourne",
        postedText="2 days ago",
        snippet="Hybrid full-time role building product systems.",
        listingUrl="https://au.linkedin.com/jobs/view/job-1?trackingId=123",
        applicationUrl="https://acme.example/jobs/1?utm_source=test",
        applicationUrlType="external",
        searchQueryMatch="strong",
        dedupeKey="",
    )
    for key, value in overrides.items():
        setattr(result, key, value)
    result.dedupeKey = build_dedupe_key(result)
    return result


class SearchUtilsTests(unittest.TestCase):
    def test_canonicalize_url_removes_tracking_fields(self) -> None:
        self.assertEqual(
            canonicalize_url(
                "https://au.linkedin.com/jobs/view/job-1?trackingId=123&utm_source=test#fragment"
            ),
            "https://au.linkedin.com/jobs/view/job-1",
        )

    def test_parse_posted_age_days_supports_relative_strings(self) -> None:
        self.assertEqual(parse_posted_age_days("17h ago"), 0)
        self.assertEqual(parse_posted_age_days("Listed fourteen days ago"), 14)
        self.assertEqual(parse_posted_age_days("3 weeks ago"), 21)

    def test_post_filters_use_relative_age_and_keyword_inference(self) -> None:
        result = make_result()
        filters = SearchFilters(postedWithin="7d", workplaceMode="hybrid", employmentType="full-time")
        self.assertTrue(passes_post_filters(result, filters))

        too_old = SearchFilters(postedWithin="24h", workplaceMode="hybrid", employmentType="full-time")
        self.assertFalse(passes_post_filters(result, too_old))

    def test_detect_blocked_page_understands_source_signals(self) -> None:
        blocked, reason = detect_blocked_page("indeed", 200, "<title>Security Check - Indeed.com</title>")
        self.assertTrue(blocked)
        self.assertIn("security check", reason.lower())

        seek_blocked, _ = detect_blocked_page("seek", 403, "<html></html>")
        self.assertTrue(seek_blocked)


if __name__ == "__main__":
    unittest.main()
