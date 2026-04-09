import { load } from "cheerio";
import type { SearchRequest, SearchSource } from "@/lib/search/types";
import { cleanText } from "@/lib/search/server/utils";

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const SOURCE_HINTS: Record<SearchSource, string> = {
  linkedin: "LinkedIn jobs",
  seek: "SEEK jobs",
  indeed: "Indeed jobs",
  careerone: "CareerOne jobs",
  adzuna: "Adzuna jobs",
  talent: "Talent.com jobs",
};

const SOURCE_DOMAINS: Record<SearchSource, string[]> = {
  linkedin: ["linkedin.com"],
  seek: ["seek.com.au"],
  indeed: ["indeed.com"],
  careerone: ["careerone.com.au"],
  adzuna: ["adzuna.com.au"],
  talent: ["talent.com"],
};

function buildFallbackQuery(source: SearchSource, request: SearchRequest) {
  return `${request.jobTitle} ${request.location} ${SOURCE_HINTS[source]}`;
}

export function extractDuckDuckGoCandidateUrls(source: SearchSource, html: string): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $("a[href]").each((_, element) => {
    const href = cleanText($(element).attr("href"));
    if (!href.startsWith("http")) return;
    if (!SOURCE_DOMAINS[source].some((domain) => href.includes(domain))) return;
    if (urls.includes(href)) return;
    urls.push(href);
  });

  return urls;
}

export async function discoverFallbackUrls(
  source: SearchSource,
  request: SearchRequest,
  signal?: AbortSignal,
  limit = 3,
): Promise<string[]> {
  const response = await fetch(DUCKDUCKGO_HTML_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      "Accept-Language": "en-AU,en;q=0.9",
    },
    body: new URLSearchParams({
      q: buildFallbackQuery(source, request),
      kl: "au-en",
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo fallback failed with HTTP ${response.status}.`);
  }

  const html = await response.text();
  return extractDuckDuckGoCandidateUrls(source, html).slice(0, limit);
}
