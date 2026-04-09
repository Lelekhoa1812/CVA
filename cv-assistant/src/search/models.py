from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha1
from typing import Literal

SearchSource = Literal["linkedin", "seek", "indeed"]
ApplicationUrlType = Literal["external", "board-detail", "listing"]
SearchQueryMatch = Literal["strong", "partial"]
PostedWithin = Literal["any", "24h", "3d", "7d", "14d", "30d"]
WorkplaceMode = Literal["any", "remote", "hybrid", "onsite"]
EmploymentType = Literal["any", "full-time", "part-time", "contract", "internship"]

SEARCH_SOURCES: tuple[SearchSource, ...] = ("linkedin", "seek", "indeed")


@dataclass(slots=True)
class SearchFilters:
    postedWithin: PostedWithin = "any"
    workplaceMode: WorkplaceMode = "any"
    employmentType: EmploymentType = "any"

    @classmethod
    def from_dict(cls, payload: dict[str, str] | None) -> "SearchFilters":
        payload = payload or {}
        return cls(
            postedWithin=payload.get("postedWithin", "any"),  # type: ignore[arg-type]
            workplaceMode=payload.get("workplaceMode", "any"),  # type: ignore[arg-type]
            employmentType=payload.get("employmentType", "any"),  # type: ignore[arg-type]
        )


@dataclass(slots=True)
class SearchRequest:
    jobTitle: str
    location: str
    filters: SearchFilters
    maxResultsPerSource: int = 50

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "SearchRequest":
        return cls(
            jobTitle=str(payload.get("jobTitle", "")).strip(),
            location=str(payload.get("location", "")).strip(),
            filters=SearchFilters.from_dict(
                payload.get("filters") if isinstance(payload.get("filters"), dict) else None
            ),
            maxResultsPerSource=int(payload.get("maxResultsPerSource", 50) or 50),
        )


@dataclass(slots=True)
class JobSearchResult:
    source: SearchSource
    title: str
    company: str
    location: str
    postedText: str
    snippet: str
    listingUrl: str
    applicationUrl: str
    applicationUrlType: ApplicationUrlType
    searchQueryMatch: SearchQueryMatch
    dedupeKey: str
    id: str = ""

    def finalize(self) -> "JobSearchResult":
        if not self.id:
            self.id = sha1(self.dedupeKey.encode("utf-8")).hexdigest()[:16]
        return self

    def to_payload(self) -> dict[str, object]:
        return asdict(self)
