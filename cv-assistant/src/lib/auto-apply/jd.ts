import { detectAts, safeHttpUrl, SCHEMA_PROVIDERS } from "./ats";
import { fetchText, getPostingDetail, htmlToText } from "./ats-clients";
import { extractListingDetails } from "./discovery";

/** A description at least this long carries enough requirements to write a tailored letter. */
export const RICH_DESCRIPTION_CHARS = 1500;
const MIN_USEFUL_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 9000;

export type CrawledDescription = { text: string; source: "provided" | "ats_api" | "listing_page" | "page_text" | "none" };

function clean(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Returns the fullest job description available. Search snippets are often a few lines, so a thin description is
 * topped up from the employer ATS API, the page's JSON-LD, or finally the visible page text.
 */
export async function crawlJobDescription(args: {
  description?: string;
  urls: Array<string | undefined | null>;
  signal?: AbortSignal;
}): Promise<CrawledDescription> {
  const provided = clean(args.description || "");
  if (provided.length >= RICH_DESCRIPTION_CHARS) return { text: provided.slice(0, MAX_DESCRIPTION_CHARS), source: "provided" };

  let best: CrawledDescription = provided.length >= MIN_USEFUL_CHARS ? { text: provided, source: "provided" } : { text: "", source: "none" };
  const consider = (text: string, source: CrawledDescription["source"]) => {
    const cleaned = clean(text).slice(0, MAX_DESCRIPTION_CHARS);
    if (cleaned.length > best.text.length && cleaned.length >= MIN_USEFUL_CHARS) best = { text: cleaned, source };
  };

  const seen = new Set<string>();
  for (const raw of args.urls) {
    const url = safeHttpUrl(raw);
    if (!url || seen.has(url) || args.signal?.aborted) continue;
    seen.add(url);
    try {
      const ats = detectAts(url);
      if (SCHEMA_PROVIDERS.has(ats.provider)) {
        const detail = await getPostingDetail(ats.provider, ats.board, ats.jobId, args.signal);
        if (detail?.descriptionText) consider(detail.descriptionText, "ats_api");
      }
      if (best.text.length >= RICH_DESCRIPTION_CHARS) break;
      const page = await fetchText(url, { timeoutMs: 12_000, signal: args.signal });
      if (!page.ok || !page.body) continue;
      const listing = extractListingDetails(page.body, page.url || url);
      if (listing.description) consider(htmlToText(listing.description), "listing_page");
      if (best.text.length < RICH_DESCRIPTION_CHARS) {
        const body = page.body.replace(/<(script|style|nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, " ");
        consider(htmlToText(body), "page_text");
      }
    } catch {
      if (args.signal?.aborted) break;
    }
    if (best.text.length >= RICH_DESCRIPTION_CHARS) break;
  }
  return best;
}
