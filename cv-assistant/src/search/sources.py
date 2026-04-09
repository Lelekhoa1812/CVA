from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import urlencode

from bs4 import BeautifulSoup
import requests

from search.fallback import discover_fallback_urls
from search.models import JobSearchResult, SearchRequest, SearchSource
from search.utils import (
    absolute_url,
    build_dedupe_key,
    canonicalize_url,
    choose_application_url,
    clean_text,
    compute_search_query_match,
    detect_blocked_page,
    extract_apply_link,
    truncate_text,
)

ProgressEmitter = Callable[[SearchSource, str, int, int, str | None, str | None], None]
LINKEDIN_PAGE_SIZE = 10


def crawl_source(
    source: SearchSource,
    request: SearchRequest,
    session: requests.Session,
    emit_progress: ProgressEmitter,
) -> Iterator[JobSearchResult]:
    if source == "linkedin":
        yield from crawl_linkedin(request, session, emit_progress)
        return

    yield from crawl_block_prone_source(source, request, session, emit_progress)


def build_linkedin_search_url(request: SearchRequest, start: int) -> str:
    params = {
        "keywords": request.jobTitle,
        "location": request.location,
        "start": str(start),
    }

    posted_map = {
        "24h": "r86400",
        "3d": "r259200",
        "7d": "r604800",
        "14d": "r1209600",
        "30d": "r2592000",
    }
    workplace_map = {
        "onsite": "1",
        "remote": "2",
        "hybrid": "3",
    }
    employment_map = {
        "full-time": "F",
        "part-time": "P",
        "contract": "C",
        "internship": "I",
    }

    if request.filters.postedWithin in posted_map:
        params["f_TPR"] = posted_map[request.filters.postedWithin]
    if request.filters.workplaceMode in workplace_map:
        params["f_WT"] = workplace_map[request.filters.workplaceMode]
    if request.filters.employmentType in employment_map:
        params["f_JT"] = employment_map[request.filters.employmentType]

    return f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?{urlencode(params)}"


def parse_linkedin_search_cards(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    cards: list[dict[str, str]] = []

    for card in soup.select(".base-search-card"):
        link = card.select_one("a.base-card__full-link[href]")
        title = clean_text(card.select_one(".base-search-card__title").get_text(" ", strip=True) if card.select_one(".base-search-card__title") else "")
        if not link or not title:
            continue

        cards.append(
            {
                "title": title,
                "company": clean_text(card.select_one(".base-search-card__subtitle").get_text(" ", strip=True) if card.select_one(".base-search-card__subtitle") else ""),
                "location": clean_text(card.select_one(".job-search-card__location").get_text(" ", strip=True) if card.select_one(".job-search-card__location") else ""),
                "posted_text": clean_text(card.select_one("time").get_text(" ", strip=True) if card.select_one("time") else ""),
                "snippet": clean_text(card.select_one(".job-posting-benefits__text").get_text(" ", strip=True) if card.select_one(".job-posting-benefits__text") else ""),
                "listing_url": canonicalize_url(link.get("href", "")),
            }
        )

    return cards


def parse_linkedin_detail_page(html: str, listing_url: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    description = ""
    for selector in ("div.show-more-less-html__markup", "div.description__text", "div.core-section-container__content"):
        node = soup.select_one(selector)
        if node:
            description = clean_text(node.get_text(" ", strip=True))
            if description:
                break

    anchors = [(anchor.get_text(" ", strip=True), anchor.get("href", "")) for anchor in soup.find_all("a", href=True)]
    application_url, application_type = extract_apply_link("linkedin", anchors, listing_url)

    return {
        "title": clean_text(soup.select_one(".topcard__title").get_text(" ", strip=True) if soup.select_one(".topcard__title") else ""),
        "company": clean_text(soup.select_one("a.topcard__org-name-link").get_text(" ", strip=True) if soup.select_one("a.topcard__org-name-link") else ""),
        "location": clean_text(soup.select_one(".topcard__flavor--bullet").get_text(" ", strip=True) if soup.select_one(".topcard__flavor--bullet") else ""),
        "posted_text": clean_text(soup.select_one("span.posted-time-ago__text").get_text(" ", strip=True) if soup.select_one("span.posted-time-ago__text") else ""),
        "snippet": truncate_text(description),
        "application_url": application_url,
        "application_type": application_type,
    }


def crawl_linkedin(
    request: SearchRequest,
    session: requests.Session,
    emit_progress: ProgressEmitter,
) -> Iterator[JobSearchResult]:
    results_found = 0
    pages_scanned = 0

    emit_progress("linkedin", "running", pages_scanned, results_found, "Scanning public guest listings.", None)

    for start in range(0, request.maxResultsPerSource, LINKEDIN_PAGE_SIZE):
        response = session.get(build_linkedin_search_url(request, start), timeout=20)
        blocked, blocked_reason = detect_blocked_page("linkedin", response.status_code, response.text)
        if blocked:
            emit_progress("linkedin", "blocked", pages_scanned, results_found, "LinkedIn blocked the guest crawl.", blocked_reason)
            return

        cards = parse_linkedin_search_cards(response.text)
        if not cards:
            break

        pages_scanned += 1
        emit_progress("linkedin", "running", pages_scanned, results_found, "Reading LinkedIn cards.", None)

        for card in cards:
            if results_found >= request.maxResultsPerSource:
                break

            detail = {}
            try:
                detail_response = session.get(card["listing_url"], timeout=20)
                blocked_detail, _ = detect_blocked_page("linkedin", detail_response.status_code, detail_response.text)
                if not blocked_detail:
                    detail = parse_linkedin_detail_page(detail_response.text, card["listing_url"])
            except requests.RequestException:
                detail = {}

            application_url, application_type = choose_application_url(
                "linkedin",
                detail.get("application_url"),
                card["listing_url"],
            )

            result = JobSearchResult(
                source="linkedin",
                title=detail.get("title") or card["title"],
                company=detail.get("company") or card["company"],
                location=detail.get("location") or card["location"],
                postedText=detail.get("posted_text") or card["posted_text"],
                snippet=detail.get("snippet") or card["snippet"],
                listingUrl=card["listing_url"],
                applicationUrl=application_url,
                applicationUrlType=detail.get("application_type", application_type),  # type: ignore[arg-type]
                searchQueryMatch=compute_search_query_match(
                    request.jobTitle,
                    [card["title"], card["company"], detail.get("snippet", ""), card["location"]],
                ),
                dedupeKey="",
            )
            result.dedupeKey = build_dedupe_key(result)
            results_found += 1
            emit_progress("linkedin", "running", pages_scanned, results_found, "Streaming LinkedIn matches.", None)
            yield result.finalize()

        if len(cards) < LINKEDIN_PAGE_SIZE or results_found >= request.maxResultsPerSource:
            break

    emit_progress("linkedin", "complete", pages_scanned, results_found, "LinkedIn scan finished.", None)


def build_source_search_url(source: SearchSource, request: SearchRequest) -> str:
    if source == "seek":
        return f"https://www.seek.com.au/jobs?{urlencode({'keywords': request.jobTitle, 'where': request.location})}"
    return f"https://au.indeed.com/jobs?{urlencode({'q': request.jobTitle, 'l': request.location})}"


def parse_source_search_links(source: SearchSource, html: str, base_url: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = absolute_url(anchor.get("href", ""), base_url)
        title = clean_text(anchor.get_text(" ", strip=True))
        if not title:
            continue
        if source == "seek" and "/job/" not in href:
            continue
        if source == "indeed" and all(token not in href for token in ("/viewjob", "/rc/clk")):
            continue

        canonical = canonicalize_url(href)
        if canonical in seen_urls:
            continue
        seen_urls.add(canonical)

        container = anchor.find_parent(["article", "li", "div"])
        links.append(
            {
                "title": title,
                "listing_url": canonical,
                "context": clean_text(container.get_text(" ", strip=True) if container else title),
            }
        )

    return links


def find_jobposting_payload(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        payload_type = payload.get("@type")
        if payload_type == "JobPosting":
            return payload
        for value in payload.values():
            found = find_jobposting_payload(value)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = find_jobposting_payload(item)
            if found:
                return found
    return None


def parse_generic_detail_page(source: SearchSource, html: str, listing_url: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    payload: dict[str, Any] | None = None
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            payload = find_jobposting_payload(json.loads(raw))
        except json.JSONDecodeError:
            continue
        if payload:
            break

    description = ""
    if payload and isinstance(payload.get("description"), str):
        description = clean_text(payload["description"])
    if not description:
        description = clean_text(soup.select_one("meta[name='description']").get("content", "") if soup.select_one("meta[name='description']") else "")

    anchors = [(anchor.get_text(" ", strip=True), anchor.get("href", "")) for anchor in soup.find_all("a", href=True)]
    application_url, application_type = extract_apply_link(source, anchors, listing_url)

    job_location = ""
    if payload and isinstance(payload.get("jobLocation"), dict):
        address = payload["jobLocation"].get("address", {})
        job_location = clean_text(" ".join(filter(None, [address.get("addressLocality"), address.get("addressRegion"), address.get("addressCountry")])))

    company_name = ""
    if payload:
        hiring_org = payload.get("hiringOrganization")
        if isinstance(hiring_org, dict):
            company_name = clean_text(str(hiring_org.get("name", "")))

    employment = ""
    if payload and payload.get("employmentType"):
        employment = clean_text(str(payload["employmentType"]))

    return {
        "title": clean_text(str(payload.get("title", ""))) if payload else "",
        "company": company_name,
        "location": job_location,
        "posted_text": clean_text(str(payload.get("datePosted", ""))) if payload else "",
        "snippet": truncate_text(" ".join(filter(None, [description, employment]))),
        "application_url": application_url,
        "application_type": application_type,
    }


def crawl_landing_page(
    source: SearchSource,
    request: SearchRequest,
    session: requests.Session,
    emit_progress: ProgressEmitter,
    landing_url: str,
    pages_scanned: int,
    results_found: int,
) -> tuple[list[JobSearchResult], int, int]:
    response = session.get(landing_url, timeout=20)
    blocked, _ = detect_blocked_page(source, response.status_code, response.text)
    if blocked:
        return [], pages_scanned, results_found

    pages_scanned += 1
    emit_progress(source, "running", pages_scanned, results_found, f"Inspecting {source.upper()} landing page.", None)

    links = parse_source_search_links(source, response.text, landing_url)
    results: list[JobSearchResult] = []

    for link in links:
        if results_found >= request.maxResultsPerSource:
            break

        detail: dict[str, str] = {}
        try:
            detail_response = session.get(link["listing_url"], timeout=20)
            blocked_detail, _ = detect_blocked_page(source, detail_response.status_code, detail_response.text)
            if blocked_detail:
                continue
            detail = parse_generic_detail_page(source, detail_response.text, link["listing_url"])
        except requests.RequestException:
            detail = {}

        application_url, application_type = choose_application_url(
            source,
            detail.get("application_url"),
            link["listing_url"],
        )

        result = JobSearchResult(
            source=source,
            title=detail.get("title") or link["title"],
            company=detail.get("company", ""),
            location=detail.get("location", ""),
            postedText=detail.get("posted_text", ""),
            snippet=detail.get("snippet") or truncate_text(link["context"]),
            listingUrl=link["listing_url"],
            applicationUrl=application_url,
            applicationUrlType=detail.get("application_type", application_type),  # type: ignore[arg-type]
            searchQueryMatch=compute_search_query_match(
                request.jobTitle,
                [link["title"], detail.get("company", ""), link["context"]],
            ),
            dedupeKey="",
        )
        result.dedupeKey = build_dedupe_key(result)
        results.append(result.finalize())
        results_found += 1
        emit_progress(source, "running", pages_scanned, results_found, f"Streaming {source.upper()} matches.", None)

    return results, pages_scanned, results_found


def crawl_block_prone_source(
    source: SearchSource,
    request: SearchRequest,
    session: requests.Session,
    emit_progress: ProgressEmitter,
) -> Iterator[JobSearchResult]:
    results_found = 0
    pages_scanned = 0
    direct_url = build_source_search_url(source, request)

    emit_progress(source, "running", pages_scanned, results_found, "Attempting direct crawl.", None)
    response = session.get(direct_url, timeout=20)
    blocked, blocked_reason = detect_blocked_page(source, response.status_code, response.text)

    if not blocked:
        direct_results, pages_scanned, results_found = crawl_landing_page(
            source,
            request,
            session,
            emit_progress,
            direct_url,
            pages_scanned,
            results_found,
        )
        for result in direct_results:
            yield result
        if direct_results:
            emit_progress(source, "complete", pages_scanned, results_found, f"{source.upper()} scan finished.", None)
            return

    emit_progress(
        source,
        "running",
        pages_scanned,
        results_found,
        "Direct access was blocked, trying discovery fallback.",
        blocked_reason,
    )

    fallback_urls = []
    try:
        fallback_urls = discover_fallback_urls(source, request, session)
    except requests.RequestException:
        fallback_urls = []

    for fallback_url in fallback_urls:
        fallback_results, pages_scanned, results_found = crawl_landing_page(
            source,
            request,
            session,
            emit_progress,
            fallback_url,
            pages_scanned,
            results_found,
        )
        for result in fallback_results:
            yield result
        if results_found >= request.maxResultsPerSource:
            break

    final_status = "complete" if results_found else "blocked"
    final_message = (
        f"{source.upper()} scan finished."
        if results_found
        else f"{source.upper()} remained unavailable after fallback."
    )
    emit_progress(source, final_status, pages_scanned, results_found, final_message, blocked_reason)
