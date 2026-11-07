// Public (unauthenticated) ATS clients. Each client can list a board's open postings, load one posting with its
// full description, and read the employer's real application form schema. Every request carries a timeout so a
// slow employer board can never stall a serverless function.
import { load } from "cheerio";
import { buildQuestion, type FormQuestion, type FormQuestionType, type QuestionOption } from "./questions";
import type { AtsProvider } from "./ats";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 9000;
const MAX_DESCRIPTION_CHARS = 20000;

export type AtsPosting = {
  provider: AtsProvider;
  board: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  workplace: string;
  descriptionText: string;
  listingUrl: string;
  applyUrl: string;
  postedAt: string;
};

export type AtsPostingDetail = AtsPosting & { questions: FormQuestion[] };

function timeoutSignal(ms: number, parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(ms);
  return parent ? AbortSignal.any([timeout, parent]) : timeout;
}

export async function fetchText(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const response = await fetch(url, {
    method: init.method || "GET",
    body: init.body,
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-AU,en;q=0.9", ...(init.headers || {}) },
    signal: timeoutSignal(init.timeoutMs || DEFAULT_TIMEOUT_MS, init.signal),
    cache: "no-store",
    redirect: "follow",
  });
  return { status: response.status, ok: response.ok, url: response.url, body: await response.text() };
}

export async function fetchJson<T>(
  url: string,
  init: { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T | null> {
  try {
    const result = await fetchText(url, {
      method: init.method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      timeoutMs: init.timeoutMs,
      signal: init.signal,
    });
    if (!result.ok) return null;
    return JSON.parse(result.body) as T;
  } catch {
    return null;
  }
}

export function htmlToText(html: string) {
  if (!html) return "";
  const decoded = html.includes("&lt;") ? load(`<div>${html}</div>`)("div").text() : html;
  const $ = load(`<div id="root">${decoded}</div>`);
  $("br").replaceWith("\n");
  $("li").each((_, element) => {
    $(element).prepend("• ").append("\n");
  });
  $("p, h1, h2, h3, h4, h5, div, ul, ol").each((_, element) => {
    $(element).append("\n");
  });
  return $("#root")
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_DESCRIPTION_CHARS);
}

// ---------------------------------------------------------------------------------------------------------------
// Greenhouse

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
  questions?: GreenhouseQuestion[];
  location_questions?: GreenhouseQuestion[];
  demographic_questions?: { questions?: Array<{ id: number; label: string; required: boolean; answer_options?: Array<{ id: number; label: string }>; type?: string }> } | null;
  compliance?: Array<{ type: string; questions?: GreenhouseQuestion[] }> | null;
};

type GreenhouseQuestion = {
  label: string;
  required: boolean;
  description?: string | null;
  fields: Array<{ name: string; type: string; values?: Array<{ label: string; value: string | number }> }>;
};

const GREENHOUSE_TYPES: Record<string, FormQuestionType> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_hidden: "text",
};

function greenhouseQuestions(questions: GreenhouseQuestion[] | undefined, prefix: string): FormQuestion[] {
  return (questions || []).flatMap((question, index) => {
    const field = question.fields.find((entry) => entry.type !== "input_hidden") || question.fields[0];
    if (!field) return [];
    // Latitude/longitude are filled by Greenhouse's own location autocomplete widget, not by the applicant.
    if (/^(latitude|longitude)$/i.test(field.name) || /^(latitude|longitude)$/i.test(question.label.trim())) return [];
    const type = GREENHOUSE_TYPES[field.type] || "text";
    const options: QuestionOption[] = (field.values || []).map((value) => ({ label: value.label, value: String(value.value) }));
    const isBooleanSelect =
      type === "select" && options.length === 2 && options.every((option) => /^(yes|no)$/i.test(option.label));
    return [
      buildQuestion({
        id: `${prefix}:${field.name || index}`,
        fieldName: field.name,
        label: question.label,
        type: isBooleanSelect ? "boolean" : type,
        required: question.required,
        options,
        description: question.description ? htmlToText(question.description).slice(0, 400) : undefined,
      }),
    ];
  });
}

const greenhouseCompanyCache = new Map<string, string>();

async function greenhouseCompanyName(board: string, signal?: AbortSignal) {
  if (greenhouseCompanyCache.has(board)) return greenhouseCompanyCache.get(board)!;
  const data = await fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${board}`, { signal });
  const name = data?.name || titleCaseSlug(board);
  greenhouseCompanyCache.set(board, name);
  return name;
}

export async function listGreenhouse(board: string, signal?: AbortSignal): Promise<AtsPosting[]> {
  const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`, { signal });
  if (!data?.jobs) return [];
  const company = await greenhouseCompanyName(board, signal);
  return data.jobs.map((job) => ({
    provider: "greenhouse",
    board,
    jobId: String(job.id),
    title: job.title,
    company,
    location: job.location?.name || "",
    workplace: inferWorkplace(job.location?.name || ""),
    descriptionText: "",
    listingUrl: job.absolute_url,
    applyUrl: job.absolute_url,
    postedAt: job.first_published || job.updated_at || "",
  }));
}

export async function getGreenhouse(board: string, jobId: string, signal?: AbortSignal): Promise<AtsPostingDetail | null> {
  const job = await fetchJson<GreenhouseJob>(
    `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}?questions=true`,
    { signal },
  );
  if (!job?.id) return null;
  const company = job.company_name || (await greenhouseCompanyName(board, signal));
  const demographic = (job.demographic_questions?.questions || []).map((question) =>
    buildQuestion({
      id: `gh-demo:${question.id}`,
      fieldName: `demographic_${question.id}`,
      label: question.label,
      type: question.type === "multi_value_multi_select" ? "multiselect" : "select",
      required: question.required,
      options: (question.answer_options || []).map((option) => ({ label: option.label, value: String(option.id) })),
      category: "demographic",
    }),
  );
  const compliance = (job.compliance || []).flatMap((entry, index) => greenhouseQuestions(entry.questions, `gh-comp${index}`));
  return {
    provider: "greenhouse",
    board,
    jobId: String(job.id),
    title: job.title,
    company,
    location: job.location?.name || "",
    workplace: inferWorkplace(job.location?.name || ""),
    descriptionText: htmlToText(job.content || ""),
    listingUrl: job.absolute_url,
    applyUrl: job.absolute_url,
    postedAt: job.first_published || job.updated_at || "",
    questions: [
      ...greenhouseQuestions(job.questions, "gh"),
      ...greenhouseQuestions(job.location_questions, "gh-loc"),
      ...compliance,
      ...demographic,
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Lever

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: Array<{ text: string; content: string }>;
};

function leverToPosting(site: string, posting: LeverPosting, company: string): AtsPosting {
  const lists = (posting.lists || []).map((list) => `${list.text}\n${htmlToText(list.content)}`).join("\n\n");
  return {
    provider: "lever",
    board: site,
    jobId: posting.id,
    title: posting.text,
    company,
    location: [posting.categories?.location, ...(posting.categories?.allLocations || [])].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(" / "),
    workplace: posting.workplaceType || inferWorkplace(posting.categories?.location || ""),
    descriptionText: [posting.descriptionPlain, lists, posting.additionalPlain].filter(Boolean).join("\n\n").slice(0, MAX_DESCRIPTION_CHARS),
    listingUrl: posting.hostedUrl,
    applyUrl: posting.applyUrl || `${posting.hostedUrl}/apply`,
    postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : "",
  };
}

export async function listLever(site: string, signal?: AbortSignal, company = titleCaseSlug(site)): Promise<AtsPosting[]> {
  const data = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${site}?mode=json`, { signal });
  if (!Array.isArray(data)) return [];
  return data.map((posting) => leverToPosting(site, posting, company));
}

export function parseLeverApplicationForm(html: string): FormQuestion[] {
  const $ = load(html);
  const questions: FormQuestion[] = [];
  const seen = new Set<string>();

  // Custom question cards carry their definition as JSON in a hidden baseTemplate input.
  $('input[name$="[baseTemplate]"]').each((_, element) => {
    const name = $(element).attr("name") || "";
    const cardId = name.match(/^cards\[([^\]]+)\]/)?.[1];
    if (!cardId) return;
    try {
      const template = JSON.parse($(element).attr("value") || "{}") as {
        fields?: Array<{ type: string; text: string; required?: boolean; description?: string; options?: Array<{ text: string }> }>;
      };
      (template.fields || []).forEach((field, index) => {
        const fieldName = `cards[${cardId}][field${index}]`;
        seen.add(fieldName);
        const type: FormQuestionType =
          field.type === "textarea"
            ? "textarea"
            : field.type === "multiple-choice" || field.type === "dropdown"
              ? "select"
              : field.type === "multiple-select"
                ? "multiselect"
                : field.type === "file-upload"
                  ? "file"
                  : "text";
        questions.push(
          buildQuestion({
            id: `lever:${fieldName}`,
            fieldName,
            label: field.text,
            type,
            required: Boolean(field.required),
            options: (field.options || []).map((option) => ({ label: option.text, value: option.text })),
            description: field.description || undefined,
          }),
        );
      });
    } catch {
      // Ignore malformed templates; the generic pass below still captures visible fields.
    }
  });

  $(".application-question").each((_, element) => {
    const block = $(element);
    const rawLabel = block.find(".application-label").first().text() || block.find("label").first().text();
    const label = rawLabel.replace(/\s+/g, " ").trim();
    const input = block.find("input:not([type=hidden]), textarea, select").first();
    const fieldName = input.attr("name") || "";
    if (!label || !fieldName || seen.has(fieldName)) return;
    seen.add(fieldName);
    const tag = (input.prop("tagName") as string | undefined)?.toLowerCase();
    const inputType = (input.attr("type") || "").toLowerCase();
    const options: QuestionOption[] =
      tag === "select"
        ? input.find("option").toArray().map((option) => ({ label: $(option).text().trim(), value: $(option).attr("value") || "" })).filter((option) => option.value)
        : block.find(`input[name="${fieldName}"]`).toArray().filter((option) => ["radio", "checkbox"].includes(($(option).attr("type") || "").toLowerCase())).map((option) => ({ label: $(option).attr("value") || "", value: $(option).attr("value") || "" }));
    const type: FormQuestionType =
      inputType === "file"
        ? "file"
        : tag === "textarea"
          ? "textarea"
          : tag === "select" || inputType === "radio"
            ? "select"
            : inputType === "checkbox"
              ? "multiselect"
              : inputType === "email"
                ? "email"
                : inputType === "tel"
                  ? "phone"
                  : "text";
    questions.push(
      buildQuestion({
        id: `lever:${fieldName}`,
        fieldName,
        label,
        type,
        required: /✱|\*/.test(rawLabel) || input.attr("required") !== undefined,
        options,
      }),
    );
  });

  return questions;
}

export async function getLever(site: string, jobId: string, signal?: AbortSignal, company = titleCaseSlug(site)): Promise<AtsPostingDetail | null> {
  const posting = await fetchJson<LeverPosting>(`https://api.lever.co/v0/postings/${site}/${jobId}?mode=json`, { signal });
  if (!posting?.id) return null;
  const base = leverToPosting(site, posting, company);
  let questions: FormQuestion[] = [];
  try {
    const page = await fetchText(base.applyUrl, { headers: { Accept: "text/html" }, signal });
    if (page.ok) questions = parseLeverApplicationForm(page.body);
  } catch {
    questions = [];
  }
  return { ...base, questions };
}

// ---------------------------------------------------------------------------------------------------------------
// Ashby

type AshbyJob = {
  id?: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  workplaceType?: string;
  isRemote?: boolean;
  isListed?: boolean;
  descriptionPlain?: string;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
};

function ashbyJobId(job: AshbyJob) {
  return job.id || job.jobUrl.replace(/\/+$/, "").split("/").pop() || "";
}

function ashbyToPosting(org: string, job: AshbyJob, company: string): AtsPosting {
  const locations = [job.location, ...(job.secondaryLocations || []).map((entry) => entry.location)].filter(Boolean);
  return {
    provider: "ashby",
    board: org,
    jobId: ashbyJobId(job),
    title: job.title,
    company,
    location: [...new Set(locations)].join(" / "),
    workplace: job.workplaceType || (job.isRemote ? "Remote" : ""),
    descriptionText: (job.descriptionPlain || "").slice(0, MAX_DESCRIPTION_CHARS),
    listingUrl: job.jobUrl,
    applyUrl: job.applyUrl || `${job.jobUrl.replace(/\/+$/, "")}/application`,
    postedAt: job.publishedAt || "",
  };
}

const ashbyBoardCache = new Map<string, { at: number; jobs: AshbyJob[] }>();

async function ashbyBoard(org: string, signal?: AbortSignal) {
  const cached = ashbyBoardCache.get(org);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.jobs;
  const data = await fetchJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${org}`, { signal, timeoutMs: 12000 });
  const jobs = (data?.jobs || []).filter((job) => job.isListed !== false);
  ashbyBoardCache.set(org, { at: Date.now(), jobs });
  return jobs;
}

export async function listAshby(org: string, signal?: AbortSignal, company = titleCaseSlug(org)): Promise<AtsPosting[]> {
  return (await ashbyBoard(org, signal)).map((job) => ashbyToPosting(org, job, company));
}

const ASHBY_FORM_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id title
    applicationForm { sections { title fieldEntries { ... on FormFieldEntry { id field isRequired descriptionHtml } } } }
  }
}`;

type AshbyField = { path?: string; title?: string; type?: string; selectableValues?: Array<{ label: string; value: string }> };

const ASHBY_TYPES: Record<string, FormQuestionType> = {
  String: "text",
  LongText: "textarea",
  Email: "email",
  Phone: "phone",
  File: "file",
  Boolean: "boolean",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  Number: "number",
  Date: "date",
  Location: "text",
  SocialLink: "url",
};

export async function getAshby(org: string, jobId: string, signal?: AbortSignal, company = titleCaseSlug(org)): Promise<AtsPostingDetail | null> {
  const jobs = await ashbyBoard(org, signal);
  const job = jobs.find((entry) => ashbyJobId(entry) === jobId);
  const result = await fetchJson<{
    data?: { jobPosting?: { title: string; applicationForm?: { sections?: Array<{ fieldEntries?: Array<{ id: string; field: AshbyField; isRequired: boolean; descriptionHtml?: string }> }> } } };
  }>("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
    method: "POST",
    body: {
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: org, jobPostingId: jobId },
      query: ASHBY_FORM_QUERY,
    },
    signal,
  });
  const posting = result?.data?.jobPosting;
  if (!job && !posting) return null;
  const base = job
    ? ashbyToPosting(org, job, company)
    : {
        provider: "ashby" as const,
        board: org,
        jobId,
        title: posting?.title || "",
        company,
        location: "",
        workplace: "",
        descriptionText: "",
        listingUrl: `https://jobs.ashbyhq.com/${org}/${jobId}`,
        applyUrl: `https://jobs.ashbyhq.com/${org}/${jobId}/application`,
        postedAt: "",
      };
  const questions = (posting?.applicationForm?.sections || []).flatMap((section) =>
    (section.fieldEntries || []).flatMap((entry) => {
      const field = entry.field || {};
      if (!field.path || !field.title) return [];
      return [
        buildQuestion({
          id: `ashby:${entry.id}`,
          fieldName: field.path,
          label: field.title,
          type: ASHBY_TYPES[field.type || ""] || "text",
          required: Boolean(entry.isRequired),
          options: (field.selectableValues || []).map((value) => ({ label: value.label, value: value.value })),
          description: entry.descriptionHtml ? htmlToText(entry.descriptionHtml).slice(0, 400) : undefined,
        }),
      ];
    }),
  );
  return { ...base, questions };
}

// ---------------------------------------------------------------------------------------------------------------
// SmartRecruiters

type SmartPosting = {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  company?: { name?: string; identifier?: string };
  applyUrl?: string;
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
};

function smartLocation(posting: SmartPosting) {
  const location = posting.location || {};
  return location.fullLocation || [location.city, location.region, location.country?.toUpperCase()].filter(Boolean).join(", ");
}

export async function listSmartRecruiters(company: string, query: string, signal?: AbortSignal): Promise<AtsPosting[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (query) params.set("q", query);
  const data = await fetchJson<{ content?: SmartPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${company}/postings?${params}`,
    { signal },
  );
  return (data?.content || []).map((posting) => ({
    provider: "smartrecruiters",
    board: company,
    jobId: posting.id,
    title: posting.name,
    company: posting.company?.name || titleCaseSlug(company),
    location: smartLocation(posting),
    workplace: posting.location?.remote ? "Remote" : "",
    descriptionText: "",
    listingUrl: `https://jobs.smartrecruiters.com/${company}/${posting.id}`,
    applyUrl: `https://jobs.smartrecruiters.com/oneclick-ui/company/${company}/publication/${posting.id}`,
    postedAt: posting.releasedDate || "",
  }));
}

export async function getSmartRecruiters(company: string, jobId: string, signal?: AbortSignal): Promise<AtsPostingDetail | null> {
  const posting = await fetchJson<SmartPosting>(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${jobId}`, { signal });
  if (!posting?.id) return null;
  const sections = Object.values(posting.jobAd?.sections || {})
    .map((section) => `${section.title || ""}\n${htmlToText(section.text || "")}`.trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    provider: "smartrecruiters",
    board: company,
    jobId: posting.id,
    title: posting.name,
    company: posting.company?.name || titleCaseSlug(company),
    location: smartLocation(posting),
    workplace: posting.location?.remote ? "Remote" : "",
    descriptionText: sections.slice(0, MAX_DESCRIPTION_CHARS),
    listingUrl: posting.postingUrl || `https://jobs.smartrecruiters.com/${company}/${posting.id}`,
    applyUrl: posting.applyUrl || `https://jobs.smartrecruiters.com/oneclick-ui/company/${company}/publication/${posting.id}`,
    postedAt: posting.releasedDate || "",
    questions: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------

export async function listBoard(provider: AtsProvider, board: string, query: string, signal?: AbortSignal, company?: string) {
  switch (provider) {
    case "greenhouse":
      return listGreenhouse(board, signal);
    case "lever":
      return listLever(board, signal, company);
    case "ashby":
      return listAshby(board, signal, company);
    case "smartrecruiters":
      return listSmartRecruiters(board, query, signal);
    default:
      return [];
  }
}

export async function getPostingDetail(provider: AtsProvider, board: string, jobId: string, signal?: AbortSignal, company?: string) {
  if (!board || !jobId) return null;
  switch (provider) {
    case "greenhouse":
      return getGreenhouse(board, jobId, signal);
    case "lever":
      return getLever(board, jobId, signal, company);
    case "ashby":
      return getAshby(board, jobId, signal, company);
    case "smartrecruiters":
      return getSmartRecruiters(board, jobId, signal);
    default:
      return null;
  }
}

export function titleCaseSlug(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

export function inferWorkplace(text: string) {
  const lower = text.toLowerCase();
  if (/remote/.test(lower)) return "Remote";
  if (/hybrid/.test(lower)) return "Hybrid";
  return "";
}
