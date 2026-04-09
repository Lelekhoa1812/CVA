from __future__ import annotations

from bs4 import BeautifulSoup
import requests

from search.models import SearchRequest, SearchSource
from search.utils import clean_text

DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
SOURCE_HINTS: dict[SearchSource, str] = {
    "linkedin": "LinkedIn jobs",
    "seek": "SEEK jobs",
    "indeed": "Indeed jobs",
}
SOURCE_DOMAINS: dict[SearchSource, tuple[str, ...]] = {
    "linkedin": ("linkedin.com",),
    "seek": ("seek.com.au",),
    "indeed": ("indeed.com",),
}


def build_fallback_query(source: SearchSource, request: SearchRequest) -> str:
    return f'{request.jobTitle} {request.location} {SOURCE_HINTS[source]}'


def extract_duckduckgo_candidate_urls(source: SearchSource, html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    urls: list[str] = []

    for anchor in soup.find_all("a", href=True):
        href = clean_text(anchor.get("href"))
        if not href.startswith("http"):
            continue
        if not any(domain in href for domain in SOURCE_DOMAINS[source]):
            continue
        if href in urls:
            continue
        urls.append(href)

    return urls


def discover_fallback_urls(
    source: SearchSource,
    request: SearchRequest,
    session: requests.Session,
    limit: int = 3,
) -> list[str]:
    response = session.post(
        DUCKDUCKGO_HTML_URL,
        data={"q": build_fallback_query(source, request), "kl": "au-en"},
        timeout=20,
    )
    response.raise_for_status()
    return extract_duckduckgo_candidate_urls(source, response.text)[:limit]
