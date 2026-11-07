// Discovery (search employer ATS boards directly) and resolution (turn a job-board listing into the employer's
// real application form). Both are network-bound and defensive: every call is bounded by timeouts and failures
// degrade to the standard question set instead of failing the pipeline.
import { load } from "cheerio";
import {
  companySlugCandidates,
  detectAts,
  safeHttpUrl,
  SCHEMA_PROVIDERS,
  titleSimilarity,
  type AtsIdentity,
  type AtsProvider,
} from "./ats";
import { ATS_DIRECTORY, type DirectoryBoard } from "./ats-directory";
import { fetchText, getPostingDetail, htmlToText, listBoard, type AtsPosting } from "./ats-clients";
import { standardQuestionSet, type FormQuestion } from "./questions";

// ---------------------------------------------------------------------------------------------------------------
// Role matching

const ROLE_SYNONYMS: Array<string[]> = [
  ["ai", "artificial intelligence", "ml", "machine learning", "llm", "genai", "generative", "gen ai", "applied ai", "nlp", "deep learning", "agentic", "agent"],
  ["engineer", "engineering", "developer", "scientist", "architect"],
  ["data", "analytics"],
  ["software", "backend", "back end", "full stack", "fullstack", "platform"],
  ["frontend", "front end", "ui"],
  ["product", "pm"],
  ["manager", "lead", "head"],
  ["devops", "sre", "site reliability", "infrastructure", "cloud"],
  ["security", "cyber", "appsec"],
  ["designer", "design", "ux"],
];

const ROLE_NOISE = new Set([
  "senior", "junior", "lead", "staff", "principal", "mid", "level", "graduate", "intern", "role", "job", "jobs", "position",
  "in", "at", "for", "and", "the", "a", "an", "of", "with", "remote", "hybrid", "melbourne", "sydney", "australia",
]);

function normalizeText(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

export type RoleMatcher = { groups: string[][]; raw: string };

export function buildRoleMatcher(prompt: string): RoleMatcher {
  const text = normalizeText(prompt);
  const groups: string[][] = [];
  const consumed = new Set<string>();
  for (const synonyms of ROLE_SYNONYMS) {
    const hit = synonyms.find((term) => text.includes(` ${term} `));
    if (hit) {
      groups.push(synonyms);
      hit.split(" ").forEach((token) => consumed.add(token));
    }
  }
  text
    .trim()
    .split(" ")
    .filter((token) => token && !ROLE_NOISE.has(token) && !consumed.has(token) && token.length > 1)
    .slice(0, 3)
    .forEach((token) => groups.push([token]));
  return { groups, raw: prompt };
}

export function matchesRole(title: string, matcher: RoleMatcher) {
  if (!matcher.groups.length) return true;
  const text = normalizeText(title);
  return matcher.groups.every((group) => group.some((term) => text.includes(` ${term} `)));
}

// ---------------------------------------------------------------------------------------------------------------
// Location matching

const AU_PLACES: Record<string, string[]> = {
  melbourne: ["melbourne", "victoria", " vic "],
  sydney: ["sydney", "new south wales", " nsw "],
  brisbane: ["brisbane", "queensland", " qld "],
  perth: ["perth", "western australia", " wa "],
  adelaide: ["adelaide", "south australia"],
  canberra: ["canberra", " act "],
  hobart: ["hobart", "tasmania"],
  darwin: ["darwin", "northern territory"],
  "gold coast": ["gold coast"],
};

const AU_ANY = ["australia", " au ", " anz ", "apac", "asia pacific", ...Object.values(AU_PLACES).flat()];

export function matchesLocation(jobLocation: string, target: string, workplace = "") {
  const location = normalizeText(`${jobLocation} ${workplace}`);
  const wanted = normalizeText(target).trim();
  if (!wanted || wanted === "australia" || wanted === "au") {
    return AU_ANY.some((term) => location.includes(term.startsWith(" ") ? term : ` ${term}`)) || /\banywhere\b/.test(location);
  }
  const city = Object.keys(AU_PLACES).find((key) => wanted.includes(key));
  const cityTerms = city ? AU_PLACES[city] : [wanted];
  if (cityTerms.some((term) => location.includes(term.startsWith(" ") ? term : ` ${term}`))) return true;
  const remote = /\bremote\b|\banywhere\b|\bdistributed\b/.test(location);
  const australiaWide = /\baustralia\b|\banz\b|\bapac\b|\basia pacific\b/.test(location);
  const namesOtherCity = Object.entries(AU_PLACES).some(
    ([key, terms]) => key !== city && terms.some((term) => location.includes(term.startsWith(" ") ? term : ` ${term}`)),
  );
  if (remote && (australiaWide || /\banywhere\b/.test(location))) return true;
  // "Australia" with no city named is a nationwide or flexible listing.
  return australiaWide && !namesOtherCity;
}

// ---------------------------------------------------------------------------------------------------------------
// Directory discovery

export type DiscoveryResult = { postings: AtsPosting[]; boardsSearched: number; boardsFailed: number };

export async function discoverFromDirectory(args: {
  prompt: string;
  location: string;
  signal?: AbortSignal;
  boards?: DirectoryBoard[];
  limit?: number;
}): Promise<DiscoveryResult> {
  const matcher = buildRoleMatcher(args.prompt);
  const boards = args.boards || ATS_DIRECTORY;
  const searchTerm = args.prompt.replace(/\b(in|at)\b.*$/i, "").trim();
  let failed = 0;
  const lists = await mapWithConcurrency(boards, 12, async (board) => {
    try {
      return await listBoard(board.provider, board.board, searchTerm, args.signal, board.company);
    } catch {
      failed += 1;
      return [];
    }
  });
  const postings = lists
    .flat()
    .filter((posting) => matchesRole(posting.title, matcher) && matchesLocation(posting.location, args.location, posting.workplace));
  return { postings: postings.slice(0, args.limit || 120), boardsSearched: boards.length, boardsFailed: failed };
}

// ---------------------------------------------------------------------------------------------------------------
// Resolution

export type ResolvedJob = {
  ats: AtsIdentity & { matchedBy: "url" | "listing_link" | "company_board" | "none"; confidence: number };
  applyUrl: string;
  listingUrl: string;
  descriptionText: string;
  questions: FormQuestion[];
  formSource: "employer_schema" | "standard";
  company: string;
  location: string;
  notes: string[];
};

type ListingDetails = { description: string; externalLinks: string[]; company: string; title: string };

const ATS_LINK_PATTERN =
  /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com|myworkdayjobs\.com|pageuppeople\.com|livehire\.com|bamboohr\.com|jobvite\.com|icims\.com|taleo\.net|successfactors)/i;

export function extractListingDetails(html: string, pageUrl: string): ListingDetails {
  const $ = load(html);
  let description = "";
  let company = "";
  let title = "";
  const externalLinks = new Set<string>();

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).contents().text());
      const nodes: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        if (node?.["@type"] !== "JobPosting") continue;
        if (!description && typeof node.description === "string") description = htmlToText(node.description);
        if (!title && typeof node.title === "string") title = node.title;
        const org = node.hiringOrganization as { name?: string; sameAs?: string } | undefined;
        if (!company && org?.name) company = org.name;
        for (const candidate of [node.url, node.directApplyUrl, org?.sameAs]) {
          if (typeof candidate === "string" && ATS_LINK_PATTERN.test(candidate)) externalLinks.add(candidate);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  if (!description) {
    const markup = $(".show-more-less-html__markup, .description__text, [data-automation='jobAdDetails'], #job-details, .job-description").first();
    if (markup.length) description = htmlToText(markup.html() || "");
  }

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    let resolved = "";
    try {
      resolved = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    const nested = (() => {
      try {
        const url = new URL(resolved);
        return url.searchParams.get("url") || url.searchParams.get("redirect") || "";
      } catch {
        return "";
      }
    })();
    for (const candidate of [resolved, nested]) {
      if (candidate && ATS_LINK_PATTERN.test(candidate)) externalLinks.add(candidate);
    }
  });
  // LinkedIn hides the off-site apply URL inside an HTML comment in <code id="applyUrl">.
  const hidden = html.match(/id="applyUrl"[^>]*>\s*<!--\s*"?([^"<]+?)"?\s*-->/)?.[1];
  if (hidden) {
    try {
      const outer = new URL(hidden.replace(/&amp;/g, "&"));
      const inner = outer.searchParams.get("url");
      externalLinks.add(inner || outer.toString());
    } catch {
      // ignore
    }
  }

  return { description, externalLinks: [...externalLinks].map((link) => safeHttpUrl(link)).filter(Boolean), company, title };
}

const boardCache = new Map<string, { at: number; postings: AtsPosting[] }>();

async function cachedBoard(provider: AtsProvider, board: string, query: string, signal?: AbortSignal, company?: string) {
  const key = `${provider}:${board}`;
  const cached = boardCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.postings;
  const postings = await listBoard(provider, board, query, signal, company).catch(() => []);
  boardCache.set(key, { at: Date.now(), postings });
  return postings;
}

/** Look for the same posting on the company's own ATS board (slug guessing across providers). */
export async function findOnCompanyBoards(args: {
  company: string;
  title: string;
  location: string;
  signal?: AbortSignal;
}): Promise<{ posting: AtsPosting; score: number } | null> {
  if (!args.company.trim()) return null;
  const directory = ATS_DIRECTORY.filter((entry) => titleSimilarity(entry.company, args.company) >= 0.99);
  const slugs = companySlugCandidates(args.company).slice(0, 4);
  const attempts: Array<{ provider: AtsProvider; board: string; company?: string }> = [
    ...directory.map((entry) => ({ provider: entry.provider, board: entry.board, company: entry.company })),
    ...slugs.flatMap((slug) =>
      (["greenhouse", "lever", "ashby", "smartrecruiters"] as AtsProvider[]).map((provider) => ({ provider, board: slug, company: args.company })),
    ),
  ];
  const results = await mapWithConcurrency(attempts, 8, async (attempt) => {
    const postings = await cachedBoard(attempt.provider, attempt.board, args.title, args.signal, attempt.company);
    // A guessed slug must belong to the same company; SmartRecruiters returns its own company name to check.
    if (attempt.provider === "smartrecruiters" && postings[0] && titleSimilarity(postings[0].company, args.company) < 0.5) return null;
    let best: { posting: AtsPosting; score: number } | null = null;
    for (const posting of postings) {
      let score = titleSimilarity(posting.title, args.title);
      if (args.location && posting.location && matchesLocation(posting.location, args.location, posting.workplace)) score += 0.08;
      if (!best || score > best.score) best = { posting, score };
    }
    return best;
  });
  const best = results
    .filter((entry): entry is { posting: AtsPosting; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score)[0];
  return best && best.score >= 0.8 ? best : null;
}

export async function resolveJob(args: {
  title: string;
  company: string;
  location: string;
  listingUrl: string;
  applyUrl: string;
  descriptionText: string;
  targetLocation: string;
  signal?: AbortSignal;
}): Promise<ResolvedJob> {
  const notes: string[] = [];
  let description = args.descriptionText || "";
  let company = args.company;
  const direct = [args.applyUrl, args.listingUrl].map(detectAts).find((identity) => SCHEMA_PROVIDERS.has(identity.provider));

  const finish = async (identity: AtsIdentity, matchedBy: ResolvedJob["ats"]["matchedBy"], confidence: number): Promise<ResolvedJob | null> => {
    const detail = await getPostingDetail(identity.provider, identity.board, identity.jobId, args.signal, company || undefined).catch(() => null);
    if (!detail) return null;
    const questions = detail.questions.length ? detail.questions : standardQuestionSet(detail.company || company);
    return {
      ats: { ...identity, matchedBy, confidence },
      applyUrl: detail.applyUrl,
      listingUrl: detail.listingUrl,
      descriptionText: detail.descriptionText.length > description.length ? detail.descriptionText : description,
      questions,
      formSource: detail.questions.length ? "employer_schema" : "standard",
      company: company || detail.company,
      location: args.location || detail.location,
      notes: detail.questions.length ? notes : [...notes, `${identity.provider} form schema unavailable; using the standard question set.`],
    };
  };

  if (direct) {
    const resolved = await finish(direct, "url", 1);
    if (resolved) return resolved;
    notes.push("Employer posting could not be loaded from its ATS; it may have closed.");
  }

  const listingUrl = safeHttpUrl(args.listingUrl || args.applyUrl);
  const listingIdentity = detectAts(listingUrl);
  if (listingUrl && listingIdentity.provider === "jobboard") {
    try {
      const page = await fetchText(listingUrl, { headers: { Accept: "text/html" }, signal: args.signal, timeoutMs: 10000 });
      if (page.ok) {
        const details = extractListingDetails(page.body, page.url || listingUrl);
        if (details.description.length > description.length) description = details.description;
        if (!company && details.company) company = details.company;
        for (const link of details.externalLinks) {
          const identity = detectAts(link);
          if (SCHEMA_PROVIDERS.has(identity.provider) && identity.jobId) {
            const resolved = await finish(identity, "listing_link", 0.95);
            if (resolved) return { ...resolved, descriptionText: resolved.descriptionText || description };
          }
        }
        const nonSchema = details.externalLinks.map((link) => ({ link, identity: detectAts(link) })).find((entry) => entry.identity.provider !== "unknown" && entry.identity.provider !== "jobboard");
        if (nonSchema) {
          return {
            ats: { ...nonSchema.identity, matchedBy: "listing_link", confidence: 0.9 },
            applyUrl: nonSchema.link,
            listingUrl,
            descriptionText: description,
            questions: standardQuestionSet(company),
            formSource: "standard",
            company,
            location: args.location,
            notes: [...notes, `Employer applies through ${nonSchema.identity.provider}; its form is not publicly readable, so the standard question set is prepared.`],
          };
        }
      } else {
        notes.push(`Listing page returned HTTP ${page.status}; description kept from search results.`);
      }
    } catch {
      notes.push("Listing page could not be loaded; description kept from search results.");
    }
  }

  const match = await findOnCompanyBoards({ company, title: args.title, location: args.targetLocation || args.location, signal: args.signal }).catch(() => null);
  if (match) {
    const identity: AtsIdentity = { provider: match.posting.provider, board: match.posting.board, jobId: match.posting.jobId };
    const resolved = await finish(identity, "company_board", Math.min(0.95, match.score));
    if (resolved) return resolved;
  }

  return {
    ats: { provider: listingIdentity.provider, board: listingIdentity.board, jobId: "", matchedBy: "none", confidence: 0 },
    applyUrl: safeHttpUrl(args.applyUrl) || listingUrl,
    listingUrl,
    descriptionText: description,
    questions: standardQuestionSet(company),
    formSource: "standard",
    company,
    location: args.location,
    notes: [...notes, "Employer application form not found publicly; the standard question set is prepared and the job board link is used."],
  };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
