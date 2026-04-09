import { load, type CheerioAPI } from "cheerio";
import type {
  JobSearchResult,
  SearchRequest,
  SearchSource,
  SourceProgressStatus,
} from "@/lib/search/types";
import { discoverFallbackUrls } from "@/lib/search/server/fallback";
import {
  absoluteUrl,
  buildDedupeKey,
  buildResultId,
  canonicalizeUrl,
  chooseApplicationUrl,
  cleanText,
  computeSearchQueryMatch,
  detectBlockedPage,
  extractApplyLink,
  truncateText,
} from "@/lib/search/server/utils";

type ProgressEmitter = (event: {
  type: "source-progress";
  source: SearchSource;
  status: SourceProgressStatus;
  pagesScanned: number;
  resultsFound: number;
  message?: string;
  blockedReason?: string;
}) => void;

type SourceContext = {
  request: SearchRequest;
  signal?: AbortSignal;
  emitProgress: ProgressEmitter;
};

type SearchCard = {
  title: string;
  company: string;
  location: string;
  postedText: string;
  snippet: string;
  listingUrl: string;
};

type GenericSearchLink = {
  title: string;
  listingUrl: string;
  context: string;
};

async function fetchHtml(url: string, signal?: AbortSignal): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      "Accept-Language": "en-AU,en;q=0.9",
    },
    signal,
    cache: "no-store",
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

function buildLinkedInSearchUrl(request: SearchRequest, start: number) {
  const params = new URLSearchParams({
    keywords: request.jobTitle,
    location: request.location,
    start: String(start),
  });

  const postedMap = {
    "24h": "r86400",
    "3d": "r259200",
    "7d": "r604800",
    "14d": "r1209600",
    "30d": "r2592000",
  } as const;
  const workplaceMap = {
    onsite: "1",
    remote: "2",
    hybrid: "3",
  } as const;
  const employmentMap = {
    "full-time": "F",
    "part-time": "P",
    contract: "C",
    internship: "I",
  } as const;

  if (request.filters.postedWithin in postedMap) {
    params.set("f_TPR", postedMap[request.filters.postedWithin as keyof typeof postedMap]);
  }
  if (request.filters.workplaceMode in workplaceMap) {
    params.set("f_WT", workplaceMap[request.filters.workplaceMode as keyof typeof workplaceMap]);
  }
  if (request.filters.employmentType in employmentMap) {
    params.set("f_JT", employmentMap[request.filters.employmentType as keyof typeof employmentMap]);
  }

  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
}

function parseLinkedInSearchCards(html: string): SearchCard[] {
  const $ = load(html);
  const cards: SearchCard[] = [];

  $(".base-search-card").each((_, element) => {
    const card = $(element);
    const link = card.find("a.base-card__full-link[href]").first().attr("href");
    const title = cleanText(card.find(".base-search-card__title").first().text());
    if (!link || !title) return;

    cards.push({
      title,
      company: cleanText(card.find(".base-search-card__subtitle").first().text()),
      location: cleanText(card.find(".job-search-card__location").first().text()),
      postedText: cleanText(card.find("time").first().text()),
      snippet: cleanText(card.find(".job-posting-benefits__text").first().text()),
      listingUrl: canonicalizeUrl(link),
    });
  });

  return cards;
}

function parseLinkedInDetailPage(html: string, listingUrl: string) {
  const $ = load(html);
  let description = "";

  for (const selector of [
    "div.show-more-less-html__markup",
    "div.description__text",
    "div.core-section-container__content",
  ]) {
    const text = cleanText($(selector).first().text());
    if (text) {
      description = text;
      break;
    }
  }

  const anchors = $("a[href]")
    .toArray()
    .map((element) => ({
      label: $(element).text(),
      href: $(element).attr("href") || "",
    }));

  const applyTarget = extractApplyLink("linkedin", anchors, listingUrl);

  return {
    title: cleanText($(".topcard__title").first().text()),
    company: cleanText($("a.topcard__org-name-link").first().text()),
    location: cleanText($(".topcard__flavor--bullet").first().text()),
    postedText: cleanText($("span.posted-time-ago__text").first().text()),
    snippet: truncateText(description),
    applicationUrl: applyTarget.applicationUrl,
    applicationUrlType: applyTarget.applicationUrlType,
  };
}

function buildSourceSearchUrl(source: Exclude<SearchSource, "linkedin">, request: SearchRequest) {
  if (source === "seek") {
    return `https://www.seek.com.au/jobs?${new URLSearchParams({
      keywords: request.jobTitle,
      where: request.location,
    }).toString()}`;
  }

  return `https://au.indeed.com/jobs?${new URLSearchParams({
    q: request.jobTitle,
    l: request.location,
  }).toString()}`;
}

function parseSourceSearchLinks(
  source: Exclude<SearchSource, "linkedin">,
  html: string,
  baseUrl: string,
): GenericSearchLink[] {
  const $ = load(html);
  const links: GenericSearchLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = absoluteUrl($(element).attr("href") || "", baseUrl);
    const title = cleanText($(element).text());
    if (!title || !href) return;
    if (source === "seek" && !href.includes("/job/")) return;
    if (source === "indeed" && !href.includes("/viewjob") && !href.includes("/rc/clk")) return;

    const canonical = canonicalizeUrl(href);
    if (seen.has(canonical)) return;
    seen.add(canonical);

    const context = cleanText($(element).closest("article, li, div").text()) || title;
    links.push({ title, listingUrl: canonical, context });
  });

  return links;
}

function findJobPostingPayload(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findJobPostingPayload(item);
      if (found) return found;
    }
    return null;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (record["@type"] === "JobPosting") return record;
    for (const value of Object.values(record)) {
      const found = findJobPostingPayload(value);
      if (found) return found;
    }
  }

  return null;
}

function extractJsonLdPayload($: CheerioAPI): Record<string, unknown> | null {
  const scripts = $("script[type='application/ld+json']").toArray();
  for (const script of scripts) {
    const raw = $(script).text();
    if (!raw) continue;
    try {
      const payload = JSON.parse(raw) as unknown;
      const found = findJobPostingPayload(payload);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function parseGenericDetailPage(
  source: Exclude<SearchSource, "linkedin">,
  html: string,
  listingUrl: string,
) {
  const $ = load(html);
  const payload = extractJsonLdPayload($);

  const description =
    payload && typeof payload.description === "string"
      ? cleanText(payload.description)
      : cleanText($("meta[name='description']").attr("content"));

  const anchors = $("a[href]")
    .toArray()
    .map((element) => ({
      label: $(element).text(),
      href: $(element).attr("href") || "",
    }));

  const applyTarget = extractApplyLink(source, anchors, listingUrl);

  let location = "";
  if (payload?.jobLocation && typeof payload.jobLocation === "object" && !Array.isArray(payload.jobLocation)) {
    const address = (payload.jobLocation as { address?: Record<string, unknown> }).address || {};
    location = cleanText(
      [address.addressLocality, address.addressRegion, address.addressCountry]
        .filter((value): value is string => typeof value === "string")
        .join(" "),
    );
  }

  let company = "";
  if (
    payload?.hiringOrganization &&
    typeof payload.hiringOrganization === "object" &&
    !Array.isArray(payload.hiringOrganization) &&
    typeof (payload.hiringOrganization as { name?: unknown }).name === "string"
  ) {
    company = cleanText((payload.hiringOrganization as { name: string }).name);
  }

  const employmentType =
    payload && typeof payload.employmentType === "string" ? cleanText(payload.employmentType) : "";
  const title = payload && typeof payload.title === "string" ? cleanText(payload.title) : "";
  const postedText =
    payload && typeof payload.datePosted === "string" ? cleanText(payload.datePosted) : "";

  return {
    title,
    company,
    location,
    postedText,
    snippet: truncateText([description, employmentType].filter(Boolean).join(" ")),
    applicationUrl: applyTarget.applicationUrl,
    applicationUrlType: applyTarget.applicationUrlType,
  };
}

function buildResult(partial: Omit<JobSearchResult, "id" | "dedupeKey">): JobSearchResult {
  const dedupeKey = buildDedupeKey({ ...partial, id: "", dedupeKey: "" });
  return {
    ...partial,
    dedupeKey,
    id: buildResultId(dedupeKey),
  };
}

export async function* crawlLinkedIn({
  request,
  signal,
  emitProgress,
}: SourceContext): AsyncGenerator<JobSearchResult> {
  let resultsFound = 0;
  let pagesScanned = 0;

  emitProgress({
    type: "source-progress",
    source: "linkedin",
    status: "running",
    pagesScanned,
    resultsFound,
    message: "Scanning public guest listings.",
  });

  for (let start = 0; start < request.maxResultsPerSource; start += 10) {
    signal?.throwIfAborted?.();

    const response = await fetchHtml(buildLinkedInSearchUrl(request, start), signal);
    const blocked = detectBlockedPage("linkedin", response.status, response.body);
    if (blocked.blocked) {
      emitProgress({
        type: "source-progress",
        source: "linkedin",
        status: "blocked",
        pagesScanned,
        resultsFound,
        message: "LinkedIn blocked the guest crawl.",
        blockedReason: blocked.blockedReason,
      });
      return;
    }

    const cards = parseLinkedInSearchCards(response.body);
    if (!cards.length) break;

    pagesScanned += 1;
    emitProgress({
      type: "source-progress",
      source: "linkedin",
      status: "running",
      pagesScanned,
      resultsFound,
      message: "Reading LinkedIn cards.",
    });

    for (const card of cards) {
      signal?.throwIfAborted?.();
      if (resultsFound >= request.maxResultsPerSource) break;

      let detail: ReturnType<typeof parseLinkedInDetailPage> | null = null;
      try {
        const detailResponse = await fetchHtml(card.listingUrl, signal);
        const detailBlocked = detectBlockedPage("linkedin", detailResponse.status, detailResponse.body);
        if (!detailBlocked.blocked) {
          detail = parseLinkedInDetailPage(detailResponse.body, card.listingUrl);
        }
      } catch {
        detail = null;
      }

      const applyTarget = chooseApplicationUrl(
        "linkedin",
        detail?.applicationUrl,
        card.listingUrl,
      );

      const result = buildResult({
        source: "linkedin",
        title: detail?.title || card.title,
        company: detail?.company || card.company,
        location: detail?.location || card.location,
        postedText: detail?.postedText || card.postedText,
        snippet: detail?.snippet || card.snippet,
        listingUrl: card.listingUrl,
        applicationUrl: applyTarget.applicationUrl,
        applicationUrlType: detail?.applicationUrlType || applyTarget.applicationUrlType,
        searchQueryMatch: computeSearchQueryMatch(request.jobTitle, [
          card.title,
          card.company,
          detail?.snippet || "",
          card.location,
        ]),
      });

      resultsFound += 1;
      emitProgress({
        type: "source-progress",
        source: "linkedin",
        status: "running",
        pagesScanned,
        resultsFound,
        message: "Streaming LinkedIn matches.",
      });
      yield result;
    }

    if (cards.length < 10 || resultsFound >= request.maxResultsPerSource) break;
  }

  emitProgress({
    type: "source-progress",
    source: "linkedin",
    status: "complete",
    pagesScanned,
    resultsFound,
    message: "LinkedIn scan finished.",
  });
}

async function crawlLandingPage(
  source: Exclude<SearchSource, "linkedin">,
  request: SearchRequest,
  landingUrl: string,
  signal: AbortSignal | undefined,
  emitProgress: ProgressEmitter,
  initialPagesScanned: number,
  initialResultsFound: number,
): Promise<{ results: JobSearchResult[]; pagesScanned: number; resultsFound: number }> {
  const response = await fetchHtml(landingUrl, signal);
  const blocked = detectBlockedPage(source, response.status, response.body);
  if (blocked.blocked) {
    return {
      results: [],
      pagesScanned: initialPagesScanned,
      resultsFound: initialResultsFound,
    };
  }

  const pagesScanned = initialPagesScanned + 1;
  let resultsFound = initialResultsFound;

  emitProgress({
    type: "source-progress",
    source,
    status: "running",
    pagesScanned,
    resultsFound,
    message: `Inspecting ${source.toUpperCase()} landing page.`,
  });

  const links = parseSourceSearchLinks(source, response.body, landingUrl);
  const results: JobSearchResult[] = [];

  for (const link of links) {
    signal?.throwIfAborted?.();
    if (resultsFound >= request.maxResultsPerSource) break;

    let detail:
      | ReturnType<typeof parseGenericDetailPage>
      | null = null;
    try {
      const detailResponse = await fetchHtml(link.listingUrl, signal);
      const detailBlocked = detectBlockedPage(source, detailResponse.status, detailResponse.body);
      if (!detailBlocked.blocked) {
        detail = parseGenericDetailPage(source, detailResponse.body, link.listingUrl);
      }
    } catch {
      detail = null;
    }

    const applyTarget = chooseApplicationUrl(source, detail?.applicationUrl, link.listingUrl);
    const result = buildResult({
      source,
      title: detail?.title || link.title,
      company: detail?.company || "",
      location: detail?.location || "",
      postedText: detail?.postedText || "",
      snippet: detail?.snippet || truncateText(link.context),
      listingUrl: link.listingUrl,
      applicationUrl: applyTarget.applicationUrl,
      applicationUrlType: detail?.applicationUrlType || applyTarget.applicationUrlType,
      searchQueryMatch: computeSearchQueryMatch(request.jobTitle, [
        link.title,
        detail?.company || "",
        link.context,
      ]),
    });

    resultsFound += 1;
    emitProgress({
      type: "source-progress",
      source,
      status: "running",
      pagesScanned,
      resultsFound,
      message: `Streaming ${source.toUpperCase()} matches.`,
    });
    results.push(result);
  }

  return { results, pagesScanned, resultsFound };
}

export async function* crawlBlockProneSource({
  request,
  signal,
  emitProgress,
  source,
}: SourceContext & { source: Exclude<SearchSource, "linkedin"> }): AsyncGenerator<JobSearchResult> {
  let resultsFound = 0;
  let pagesScanned = 0;
  const directUrl = buildSourceSearchUrl(source, request);

  emitProgress({
    type: "source-progress",
    source,
    status: "running",
    pagesScanned,
    resultsFound,
    message: "Attempting direct crawl.",
  });

  const directResponse = await fetchHtml(directUrl, signal);
  const directBlocked = detectBlockedPage(source, directResponse.status, directResponse.body);

  if (!directBlocked.blocked) {
    const direct = await crawlLandingPage(
      source,
      request,
      directUrl,
      signal,
      emitProgress,
      pagesScanned,
      resultsFound,
    );
    pagesScanned = direct.pagesScanned;
    resultsFound = direct.resultsFound;
    for (const result of direct.results) {
      yield result;
    }
    if (direct.results.length > 0) {
      emitProgress({
        type: "source-progress",
        source,
        status: "complete",
        pagesScanned,
        resultsFound,
        message: `${source.toUpperCase()} scan finished.`,
      });
      return;
    }
  }

  emitProgress({
    type: "source-progress",
    source,
    status: "running",
    pagesScanned,
    resultsFound,
    message: "Direct access was blocked, trying discovery fallback.",
    blockedReason: directBlocked.blockedReason,
  });

  let fallbackUrls: string[] = [];
  try {
    fallbackUrls = await discoverFallbackUrls(source, request, signal);
  } catch {
    fallbackUrls = [];
  }

  for (const fallbackUrl of fallbackUrls) {
    const fallback = await crawlLandingPage(
      source,
      request,
      fallbackUrl,
      signal,
      emitProgress,
      pagesScanned,
      resultsFound,
    );
    pagesScanned = fallback.pagesScanned;
    resultsFound = fallback.resultsFound;
    for (const result of fallback.results) {
      yield result;
    }
    if (resultsFound >= request.maxResultsPerSource) break;
  }

  const completed = resultsFound > 0;
  emitProgress({
    type: "source-progress",
    source,
    status: completed ? "complete" : "blocked",
    pagesScanned,
    resultsFound,
    message: completed
      ? `${source.toUpperCase()} scan finished.`
      : `${source.toUpperCase()} remained unavailable after fallback.`,
    blockedReason: directBlocked.blockedReason,
  });
}
