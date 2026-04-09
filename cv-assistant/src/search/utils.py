from __future__ import annotations

import html
import re
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from search.models import (
    JobSearchResult,
    SearchFilters,
    SearchQueryMatch,
    SearchSource,
)

TRACKING_QUERY_KEYS = {
    "refid",
    "trackingid",
    "trk",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
}

WORD_NUMBERS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
}

STOP_WORDS = {"and", "the", "for", "with", "from", "into", "role", "job"}
SOURCE_DOMAINS: dict[SearchSource, tuple[str, ...]] = {
    "linkedin": ("linkedin.com",),
    "seek": ("seek.com.au",),
    "indeed": ("indeed.com",),
}


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def truncate_text(value: str, limit: int = 240) -> str:
    text = clean_text(value)
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}..."


def absolute_url(href: str, base_url: str) -> str:
    return urljoin(base_url, clean_text(href))


def canonicalize_url(url: str) -> str:
    if not url:
        return ""

    parsed = urlparse(url)
    filtered_query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_QUERY_KEYS and not key.lower().startswith("utm_")
    ]
    path = parsed.path.rstrip("/") or parsed.path or "/"
    return urlunparse(
        (
            parsed.scheme or "https",
            parsed.netloc.lower(),
            path,
            "",
            urlencode(filtered_query, doseq=True),
            "",
        )
    )


def normalize_identity(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")


def build_dedupe_key(result: JobSearchResult) -> str:
    canonical_application = canonicalize_url(result.applicationUrl)
    if canonical_application and "/jobs?" not in canonical_application:
        return canonical_application

    canonical_listing = canonicalize_url(result.listingUrl)
    if canonical_listing and "/jobs?" not in canonical_listing:
        return canonical_listing

    return "::".join(
        [
            result.source,
            normalize_identity(result.title),
            normalize_identity(result.company),
            normalize_identity(result.location),
        ]
    )


def compute_search_query_match(job_title: str, searchable_parts: Iterable[str]) -> SearchQueryMatch:
    tokens = [
        token
        for token in re.findall(r"[a-z0-9]+", clean_text(job_title).lower())
        if len(token) > 2 and token not in STOP_WORDS
    ]
    haystack = " ".join(clean_text(part).lower() for part in searchable_parts)
    if tokens and all(token in haystack for token in tokens):
        return "strong"
    return "partial"


def choose_application_url(
    source: SearchSource,
    external_url: str | None,
    detail_url: str,
    fallback_url: str | None = None,
) -> tuple[str, str]:
    if external_url:
        external_url = canonicalize_url(external_url)
        if external_url and not is_source_url(source, external_url):
            return external_url, "external"
        if external_url:
            return external_url, "board-detail"

    detail_url = canonicalize_url(detail_url)
    if detail_url:
        return detail_url, "board-detail"

    return canonicalize_url(fallback_url or detail_url), "listing"


def is_source_url(source: SearchSource, url: str) -> bool:
    hostname = urlparse(url).netloc.lower()
    return any(domain in hostname for domain in SOURCE_DOMAINS[source])


def extract_apply_link(source: SearchSource, anchors: Iterable[tuple[str, str]], fallback_url: str) -> tuple[str, str]:
    for label, href in anchors:
        lowered = clean_text(label).lower()
        if "apply" not in lowered:
            continue
        absolute = canonicalize_url(absolute_url(href, fallback_url))
        if absolute and not is_source_url(source, absolute):
            return absolute, "external"
    return choose_application_url(source, None, fallback_url)


def word_to_number(value: str) -> int | None:
    parts = value.lower().replace("-", " ").split()
    if not parts:
        return None
    if len(parts) == 1:
        return WORD_NUMBERS.get(parts[0])
    if len(parts) == 2 and parts[0] in WORD_NUMBERS and parts[1] in WORD_NUMBERS:
        return WORD_NUMBERS[parts[0]] + WORD_NUMBERS[parts[1]]
    return None


def parse_posted_age_days(posted_text: str) -> int | None:
    text = clean_text(posted_text).lower()
    if not text:
        return None

    if any(token in text for token in ("today", "just posted", "new", "hour ago", "hours ago", "h ago")):
        return 0
    if "yesterday" in text:
        return 1

    match = re.search(r"(\d+)\s*(minute|hour|day|week|month|year|m|h|d|w|mo)s?", text)
    if match:
        value = int(match.group(1))
        unit = match.group(2)
        if unit in {"minute", "hour", "m", "h"}:
            return 0
        if unit in {"day", "d"}:
            return value
        if unit in {"week", "w"}:
            return value * 7
        if unit in {"month", "mo"}:
            return value * 30
        if unit == "year":
            return value * 365

    word_match = re.search(r"listed\s+([a-z-]+)\s+days?\s+ago", text)
    if word_match:
        value = word_to_number(word_match.group(1))
        if value is not None:
            return value

    return None


def infer_workplace_mode(value: str) -> str:
    text = clean_text(value).lower()
    if "hybrid" in text:
        return "hybrid"
    if "remote" in text or "work from home" in text or "wfh" in text:
        return "remote"
    if "onsite" in text or "on-site" in text or "in office" in text:
        return "onsite"
    return "any"


def infer_employment_type(value: str) -> str:
    text = clean_text(value).lower()
    if "full time" in text or "full-time" in text:
        return "full-time"
    if "part time" in text or "part-time" in text:
        return "part-time"
    if "contract" in text or "contract/temp" in text:
        return "contract"
    if "intern" in text:
        return "internship"
    return "any"


def passes_post_filters(result: JobSearchResult, filters: SearchFilters) -> bool:
    if filters.postedWithin != "any":
        max_days = {
            "24h": 1,
            "3d": 3,
            "7d": 7,
            "14d": 14,
            "30d": 30,
        }[filters.postedWithin]
        age_days = parse_posted_age_days(result.postedText)
        if age_days is None or age_days > max_days:
            return False

    searchable = " ".join([result.title, result.company, result.location, result.snippet])

    if filters.workplaceMode != "any":
        detected_workplace = infer_workplace_mode(searchable)
        if detected_workplace != filters.workplaceMode:
            return False

    if filters.employmentType != "any":
        detected_employment = infer_employment_type(searchable)
        if detected_employment != filters.employmentType:
            return False

    return True


def detect_blocked_page(source: SearchSource, status_code: int, body: str) -> tuple[bool, str | None]:
    text = clean_text(body).lower()
    if status_code in {403, 429}:
        return True, f"{source.upper()} returned HTTP {status_code}."

    if source == "indeed" and "security check - indeed.com" in text:
        return True, "Indeed presented a security check."
    if source == "seek" and "safe-job-searching" in text:
        return True, "SEEK returned a bot-protection page."
    if source == "linkedin" and "unusual activity detected" in text:
        return True, "LinkedIn blocked guest access."

    return False, None
