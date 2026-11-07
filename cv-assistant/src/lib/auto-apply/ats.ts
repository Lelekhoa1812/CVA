// ATS detection and identity helpers.
// Every apply URL is classified into a provider so the engine knows whether it can read the employer's real
// application form (Greenhouse, Lever, Ashby, SmartRecruiters expose public schemas) or must fall back to the
// standard question set.

export const ATS_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "workday",
  "pageup",
  "livehire",
  "bamboohr",
  "jobvite",
  "icims",
  "taleo",
  "successfactors",
  "jobboard",
  "unknown",
] as const;
export type AtsProvider = (typeof ATS_PROVIDERS)[number];

export const SCHEMA_PROVIDERS = new Set<AtsProvider>(["greenhouse", "lever", "ashby", "smartrecruiters"]);

export const ATS_LABELS: Record<AtsProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  workday: "Workday",
  pageup: "PageUp",
  livehire: "LiveHire",
  bamboohr: "BambooHR",
  jobvite: "Jobvite",
  icims: "iCIMS",
  taleo: "Taleo",
  successfactors: "SuccessFactors",
  jobboard: "Job board",
  unknown: "Employer site",
};

export type AtsIdentity = {
  provider: AtsProvider;
  /** Board token / site / organisation slug, when the provider exposes one. */
  board: string;
  /** Provider job/posting identifier, when present in the URL. */
  jobId: string;
};

const JOB_BOARD_HOSTS = ["linkedin.", "seek.", "indeed.", "careerone.", "adzuna.", "talent.com", "jora."];

export function safeHttpUrl(value: string | undefined | null): string {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function detectAts(rawUrl: string | undefined | null): AtsIdentity {
  const unknown: AtsIdentity = { provider: "unknown", board: "", jobId: "" };
  const href = safeHttpUrl(rawUrl);
  if (!href) return unknown;
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("greenhouse.io")) {
    // boards.greenhouse.io/{board}/jobs/{id}, job-boards(.eu).greenhouse.io/{board}/jobs/{id},
    // boards.greenhouse.io/embed/job_app?for={board}&token={id}
    if (parts[0] === "embed") {
      return {
        provider: "greenhouse",
        board: url.searchParams.get("for") || "",
        jobId: url.searchParams.get("token") || "",
      };
    }
    const jobsIndex = parts.indexOf("jobs");
    return {
      provider: "greenhouse",
      board: parts[0] || "",
      jobId: jobsIndex >= 0 ? (parts[jobsIndex + 1] || "").replace(/\D.*$/, "") : "",
    };
  }
  const ghJid = url.searchParams.get("gh_jid");
  if (ghJid) return { provider: "greenhouse", board: "", jobId: ghJid };

  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    return { provider: "lever", board: parts[0] || "", jobId: parts[1] || "" };
  }
  if (host === "jobs.ashbyhq.com") {
    return { provider: "ashby", board: parts[0] || "", jobId: parts[1] || "" };
  }
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    return { provider: "smartrecruiters", board: parts[0] || "", jobId: (parts[1] || "").split("-")[0] };
  }
  if (host === "apply.workable.com") {
    const jIndex = parts.indexOf("j");
    return { provider: "workable", board: parts[0] || "", jobId: jIndex >= 0 ? parts[jIndex + 1] || "" : "" };
  }
  if (host.endsWith(".recruitee.com")) {
    return { provider: "recruitee", board: host.split(".")[0], jobId: parts[1] || "" };
  }
  if (host.includes("myworkdayjobs.com") || host.includes("myworkdaysite.com")) {
    return { provider: "workday", board: host.split(".")[0], jobId: parts[parts.length - 1] || "" };
  }
  if (host.endsWith("pageuppeople.com")) return { provider: "pageup", board: host.split(".")[0], jobId: "" };
  if (host.endsWith("livehire.com")) return { provider: "livehire", board: host.split(".")[0], jobId: "" };
  if (host.endsWith("bamboohr.com")) return { provider: "bamboohr", board: host.split(".")[0], jobId: parts[parts.length - 1] || "" };
  if (host.endsWith("jobvite.com")) return { provider: "jobvite", board: parts[0] || "", jobId: parts[2] || "" };
  if (host.endsWith("icims.com")) return { provider: "icims", board: host.split(".")[0], jobId: "" };
  if (host.endsWith("taleo.net")) return { provider: "taleo", board: host.split(".")[0], jobId: "" };
  if (host.includes("successfactors.") || host.endsWith("sapsf.com")) {
    return { provider: "successfactors", board: host.split(".")[0], jobId: "" };
  }
  if (JOB_BOARD_HOSTS.some((pattern) => host.includes(pattern))) return { provider: "jobboard", board: host, jobId: "" };
  return unknown;
}

export function isJobBoardUrl(url: string | undefined | null) {
  return detectAts(url).provider === "jobboard";
}

const COMPANY_SUFFIXES =
  /\b(pty|ltd|limited|inc|incorporated|llc|plc|group|holdings|australia|au|corp|corporation|co|company|technologies|technology|labs|hq|the)\b/g;

/** Candidate ATS board slugs for a company name, most likely first. */
export function companySlugCandidates(company: string): string[] {
  const base = company
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s.-]/g, " ")
    .trim();
  if (!base) return [];
  const stripped = base.replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
  const words = (stripped || base).split(/[\s.]+/).filter(Boolean);
  const candidates = [
    words.join(""),
    words.join("-"),
    words[0],
    base.replace(/[\s.]+/g, ""),
    words.length > 1 ? `${words.join("")}careers` : "",
  ];
  return [...new Set(candidates.filter((value) => value && value.length >= 2 && value.length <= 40))];
}

export function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9+#\s]/g, " ")
    .replace(/\b(sr)\b/g, "senior")
    .replace(/\b(jr)\b/g, "junior")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token overlap similarity (Dice) between two job titles, 0..1. */
export function titleSimilarity(left: string, right: string) {
  const a = new Set(normalizeTitle(left).split(" ").filter((token) => token.length > 1));
  const b = new Set(normalizeTitle(right).split(" ").filter((token) => token.length > 1));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}
