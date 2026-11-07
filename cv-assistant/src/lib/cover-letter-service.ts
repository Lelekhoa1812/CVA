import { generateJsonSafe, getModel } from "@/lib/ai";
import {
  buildCoverLetterPrompt,
  buildExperienceRankingPrompt,
  getCoverLetterContactDetails,
  getCoverLetterItems,
  type CoverLetterItem,
} from "@/lib/cover-letter";
import { generateAdvancedCoverLetter } from "@/lib/cover-letter-advanced";
import { checkDraftClaims } from "@/lib/generate/claim-check";
import type { Profile } from "@/lib/models/User";

/**
 * The cover letter agent behind both the /generate studio and Auto Apply. One prompt, one model chain, one quality
 * guard and one evidence check, so every letter in the product is written and verified the same way.
 */
const COVER_LETTER_MODELS = ["poolside/laguna-xs-2.1", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "deepseek-ai/deepseek-v4.1-flash"];

/** The stronger editors used by the grounding pass: more precise about what the CV supports, but slower. */
const GROUNDING_MODELS = ["nvidia/nemotron-3-ultra-550b-a55b", "deepseek-ai/deepseek-v4.1-flash"];
const GROUNDING_CALL_TIMEOUT_MS = 40_000;
/** The verifier only prunes; a call slower than this is dropped so a slow model cannot push the letter past its time budget. */
const VERIFIER_TIMEOUT_MS = 35_000;
/** A letter the guards still object to gets one more draft, but only when this much of the time budget is left. */
const FINAL_REDRAW_START_MS = 110_000;

/** A letter with no commas across 80+ words is a known degenerate output of some NIM models. */
export function isWellFormedLetter(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 80) return false;
  const commas = (text.match(/,/g) || []).length;
  return commas >= Math.max(2, Math.floor(words / 60));
}

const WORDS = (text: string) => text.split(/\s+/).filter(Boolean).length;
const TARGET_MIN_WORDS = 170;
/** Below this a letter is not a letter. Between this and TARGET_MIN_WORDS a short letter is honest when the CV gives little to draw on, and is flagged. */
const MIN_HONEST_WORDS = 110;
/** One slow or stalled model must not hold up a whole batch of applications. */
const MODEL_CALL_TIMEOUT_MS = 40_000;
const MAX_EXTRA_ATTEMPTS = 1;

/** Tries each model in turn; returns the first well-formed letter of a proper length, else the best letter seen. */
export async function generateLetterText(prompt: string, signal?: AbortSignal, options?: { models?: string[]; timeoutMs?: number }) {
  const models = options?.models || COVER_LETTER_MODELS;
  const callTimeout = options?.timeoutMs ?? MODEL_CALL_TIMEOUT_MS;
  let best = { text: "", model: "", rank: -1 };
  let attempts = 0;
  for (const model of models) {
    // A usable letter already exists: allow at most one more try for a better one, never the whole chain.
    if (best.rank >= 10_000 && attempts > MAX_EXTRA_ATTEMPTS) break;
    attempts += 1;
    try {
      const callSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(callTimeout)]) : AbortSignal.timeout(callTimeout);
      const result = await getModel("easy").generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], modelOverride: model, signal: callSignal });
      const text = result.response.text().replace(/^```\w*\n?|```$/g, "").trim();
      if (!text) continue;
      const wellFormed = isWellFormedLetter(text);
      const words = WORDS(text);
      if (wellFormed && words >= TARGET_MIN_WORDS) return { text, model: result.response.model };
      // Well-formed beats malformed; within each, the longer letter wins.
      const rank = (wellFormed ? 10_000 : 0) + words;
      if (rank > best.rank) best = { text, model: result.response.model, rank };
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  if (best.text) return { text: best.text, model: best.model };
  throw new Error("No model produced a cover letter");
}

function heuristicRank(items: CoverLetterItem[], jobText: string, limit: number) {
  const tokens = new Set(jobText.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").split(" ").filter((token) => token.length > 2));
  return items
    .map((item) => {
      const haystack = `${item.title} ${item.summary} ${item.description}`.toLowerCase();
      let overlap = 0;
      for (const token of tokens) if (haystack.includes(token)) overlap += 1;
      return { item, overlap };
    })
    .sort((left, right) => right.overlap - left.overlap)
    .slice(0, limit)
    .map(({ item }) => item);
}

/** Picks the candidate evidence that best proves the job's requirements: LLM ranking first, keyword overlap as the fallback. */
export async function selectEvidenceForJob(items: CoverLetterItem[], jobText: string, signal?: AbortSignal, limit = 5): Promise<CoverLetterItem[]> {
  if (items.length <= limit) return items;
  try {
    const rankSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    const parsed = (await generateJsonSafe("easy", buildExperienceRankingPrompt(jobText.slice(0, 6000), items), 0, rankSignal)) as { rankings?: Array<{ index?: number }> };
    const seen = new Set<number>();
    const picked: CoverLetterItem[] = [];
    for (const entry of Array.isArray(parsed?.rankings) ? parsed.rankings : []) {
      const item = typeof entry?.index === "number" ? items.find((candidate) => candidate.index === entry.index) : undefined;
      if (item && !seen.has(item.index)) {
        seen.add(item.index);
        picked.push(item);
      }
    }
    if (picked.length >= 2) return picked.slice(0, limit);
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return heuristicRank(items, jobText, limit);
}


const CLAIM_LEXICON = [
  "marketplace", "linux", "unix", "terabyte", "terabytes", "petabyte", "petabytes", "bare metal", "ansible", "jenkins", "prometheus", "grafana", "datadog", "splunk", "snowflake", "bigquery", "redshift", "kafka", "spark", "hadoop", "airflow", "dbt", "cloudformation", "helm", "istio", "nginx", "postgresql", "mongodb atlas", "oracle cloud", "sre", "devops", "site reliability",
  "multimodal", "multi-modal", "serverless", "production kubernetes", "medication safety",   "oauth", "oidc", "typescript", "javascript", "kubernetes", "terraform", "lidar", "graphql", "rust", "golang", "scala", "kafka", "spark", "snowflake", "databricks",
  "salesforce", "sap", "aws", "azure", "gcp", "docker", "react", "angular", "vue", "java", "kotlin", "swift", "c#", ".net", "pytorch", "tensorflow", "langchain",
  "forward-deployed", "forward deployed", "internal tools and platforms", "runbook", "runbooks", "rollback", "on-call", "incident response", "threat response", "security operations", "pagerduty", "master of", "doctor of", "master's degree", "masters degree", "postgraduate", "graduate diploma", "computer science", "systems programming", "threat hunting", "databricks", "master's", "masters", "phd", "doctorate", "mba", "pmp", "cissp", "root-cause analysis", "root cause analysis",
];

function normalise(value: string) {
  return value.toLowerCase().replace(/[‘’]/g, "'");
}

/** Tool-like terms (TensorFlow, LiDAR, C#, CrewAI, OAuth): camel-case, all-caps, or ending in # or +. Ordinary capitalised words are excluded. */
const TECH_TERM_STOP = new Set(["ai", "ml", "llm", "llms", "api", "apis", "cv", "ui", "ux", "it", "hr", "qa", "us", "au", "uk", "ceo", "cto", "kpi", "kpis", "saas", "b2b", "b2c", "ci", "cd", "ok"]);
export function extractTechTerms(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b(?:[A-Za-z]*[a-z][A-Z][A-Za-z]*|[A-Z]{2,}[a-z]{0,3}\d*|[A-Za-z]+(?:#|\+\+))(?![A-Za-z0-9])/g)) {
    const term = match[0].toLowerCase();
    if ((term.length >= 3 || /[#+]/.test(term)) && !TECH_TERM_STOP.has(term)) found.add(term);
  }
  return found;
}

/** Technology, credential and certification terms the letter asserts but the candidate's profile never mentions. */
export function findUnsupportedClaims(text: string, profile?: Partial<Profile> | null, company?: string, jobDescription?: string, title?: string): string[] {
  const facts = normalise(JSON.stringify(profile || {}));
  const letter = normalise(text);
  const employmentPattern = (name: string) => new RegExp(`\\b(?:at|with|for|joined)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},?\\s+I\\s+(?:\\w+\\s+){0,2}(?:developed|built|led|delivered|designed|shipped|managed|worked|created|implemented)`, "i");
  const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const years = Array.from(letter.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)\+?\s*(?:\+\s*)?years?\b/g)).map((match) => match[0].replace(/\s+/g, " ")).filter((term) => !facts.includes(term));
  // Specific figures and magnitudes are the applicant's own facts: flag any that the profile never states.
  const figures = Array.from(letter.matchAll(/\b\d[\d,.]*\s*(?:%|k\b|x\b|million|billion)|\b\d+[- ](?:minute|hour|day|week|month)s?\b|\b(?:sub-second|millions?|billions?|thousands)\b(?:\s+of)?/g)).map((match) => match[0].trim()).filter((term) => !facts.includes(term));
  // A personal or academic project is never an employer: "At EstateFolio, I led a team" misstates the CV.
  const projectEmployers = ((profile?.projects || []) as Array<{ name?: string }>)
    .map((project) => (project.name || "").trim())
    .filter((name) => name.length > 2 && new RegExp(`\\b(?:at|with|for)\\s+(?:the\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
    .map((name) => `project as employer: ${name}`);
  // Prior dealings with the employer's own products or content are never in a CV.
  const relationship = Array.from(text.matchAll(/\b(?:your (?:recent|existing|latest|public|current|flagship)\b[^.,;]{0,60}|co-?developed your\b[^.,;]{0,60}|highlighted in your\b[^.,;]{0,60}|foundation for your\b[^.,;]{0,60}|powering (?:[A-Z]\w+)'s\b[^.,;]{0,40})/gi)).map((match) => `claims a history with the employer: ${match[0].trim().slice(0, 60)}`);
  // Passages lifted verbatim from the posting (6+ words) are the posting talking, not the applicant.
  const echoes: string[] = [];
  if (jobDescription) {
    const words = (value: string) => normalise(value).replace(/[^a-z0-9+#' -]/g, " ").split(/\s+/).filter(Boolean);
    const jd = ` ${words(jobDescription).join(" ")} `;
    const mine = words(text);
    const known = ` ${words(JSON.stringify(profile || {})).join(" ")} `;
    for (let i = 0; i + 6 <= mine.length; i += 1) {
      const gram = mine.slice(i, i + 6).join(" ");
      const named = ` ${words(`${title || ""} ${company || ""} I am applying for the role at`).join(" ")} `;
      if (jd.includes(` ${gram} `) && !known.includes(` ${gram} `) && !gram.split(" ").every((word) => named.includes(` ${word} `))) {
        echoes.push(`echo: ${gram}`);
        i += 5;
      }
    }
  }
  // Tools and acronyms that appear in the posting and the letter but nowhere in the CV are the posting talking.
  const postingTerms: string[] = [];
  if (jobDescription) {
    const jdTerms = extractTechTerms(jobDescription);
    const named = normalise(`${title || ""} ${company || ""}`);
    for (const term of extractTechTerms(text)) {
      if (jdTerms.has(term) && !facts.includes(term) && !named.includes(term)) postingTerms.push(`posting term: ${term}`);
    }
  }
  // A degree field the education record does not give ("degree in Biomedical Informatics" for a Software Engineering major) is invented.
  const degreeClaims: string[] = [];
  {
    const education = normalise(`${profile?.major || ""} ${profile?.school || ""}`).replace(/[^a-z0-9 ]/g, " ");
    const educationWords = education.split(/\s+/).filter(Boolean);
    const fieldPattern = /\b(?:degree|bachelor|bachelors|master|masters|phd|diploma|doctorate)(?:'s)?(?:\s+degree)?\s+(?:of|in)\s+((?:[A-Z][A-Za-z&]+)(?:\s+(?:and\s+)?[A-Z][A-Za-z&]+){0,3})/g;
    const reversePattern = /\b((?:[A-Z][A-Za-z&]+)(?:\s+[A-Z][A-Za-z&]+){0,2})\s+degree\b/g;
    const fields = [...Array.from(text.matchAll(fieldPattern)).map((m) => m[1]), ...Array.from(text.matchAll(reversePattern)).map((m) => m[1])];
    for (const field of fields) {
      if ((CLAIM_LEXICON as readonly string[]).includes(normalise(field).trim())) continue;
      const words = normalise(field).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3 && !["bachelor", "master", "masters", "science", "degree", "honours", "honors", "and", "with"].includes(word));
      const stem = (word: string) => word.slice(0, Math.min(word.length, 6));
      if (words.some((word) => !educationWords.some((known) => known.startsWith(stem(word)) || word.startsWith(stem(known))))) degreeClaims.push(`degree field: ${field.trim()}`);
    }
  }
  const employer = (company || "").trim();
  const employment = employer && !facts.includes(normalise(employer)) && employmentPattern(employer).test(text) ? [`employment at ${employer}`] : [];
  return [...employment, ...relationship, ...echoes, ...postingTerms, ...degreeClaims, ...projectEmployers, ...figures, ...[...years, ...CLAIM_LEXICON].filter((term) => new RegExp(`(^|[^a-z0-9+#])${escape(term)}($|[^a-z0-9+#])`).test(letter) && !new RegExp(`(^|[^a-z0-9+#])${escape(term)}($|[^a-z0-9+#])`).test(facts))];
}

/** Turns a guard token ("echo: ...", "posting term: x") into wording an applicant can act on. */
export function describeClaim(term: string): string {
  if (term.startsWith("echo: ")) return `wording copied from the job posting ("${term.slice(6)}")`;
  if (term.startsWith("posting term: ")) return `the tool or term "${term.slice(14)}", which only the job posting mentions`;
  if (term.startsWith("degree field: ")) return `a degree in ${term.slice(14)}, which your education record does not show`;
  if (term.startsWith("project as employer: ")) return `${term.slice(21)} is described as an employer, but it is a project in your CV`;
  if (term.startsWith("claims a history with the employer: ")) return `a past connection with the employer ("${term.slice(35)}")`;
  if (term.startsWith("employment at ")) return `work at ${term.slice(14)}, which is not in your CV`;
  return term;
}

/** Structural defects that make a letter unsendable regardless of its claims. */
export function findLetterDefects(text: string, candidateName?: string, company?: string, title?: string): string[] {
  const defects: string[] = [];
  // Contact details under the name are by design: they are neither a sign-off nor a sentence fragment.
  const contactLine = /^(?:\+?[\d ()-]{8,}\s*\|.*|.*\|.*@.*|[\w.+-]+@[\w-]+\.[\w.]+(?:\s*\|.*)?|https?:\/\/\S+.*)$/i;
  const visible = text.split(/\n/).filter((line) => !contactLine.test(line.trim())).join("\n");
  if (WORDS(text) < TARGET_MIN_WORDS) defects.push("too short");
  if (text.split(/\n{2,}/).filter((part) => WORDS(part) > 25).length < 2) defects.push("is one block of text; use short paragraphs");
  if (visible.split(/\n+/).some((line) => /^[a-z0-9]/.test(line.trim()) && WORDS(line) > 3)) defects.push("contains a broken sentence fragment");
  if (/\b(?:essential|key|minimum|stated|preferred|required) (?:requirement|qualification)s?\b|\bmeeting the [^.]{0,60}requirement|\b(?:matching|meeting|fulfilling|addressing|directly addressing|directly aligning with) your (?:needs?|requirements?)\b|\b(?:directly )?aligns? with [A-Z][\w&.-]*'s (?:needs?|requirements?)\b/i.test(text)) defects.push("talks about meeting the posting's requirements instead of showing experience");
  if (title && new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.\\n]{0,40} - I `, "i").test(text.replace(/^[^\n]*\n+/, "").slice(0, 600))) defects.push("contains a garbled run-on title opening");
  if (/(^|\n)\s*(Let me know|Feel free|Happy to|Let's discuss|Thank you for (your|considering))/i.test(text)) defects.push("ends with a chat-style line instead of a closing sentence");
  const openingLine = (text.split(/\n{2,}/).find((block, index) => index > 0 && block.trim()) || "").split(/(?<=[.!?])\s/)[0] || "";
  // A proper opening starts "I am ..."; a title followed by a dash and a clause is the run-on, and a hyphen inside the title itself is not.
  if (!/^I\s/.test(openingLine.trim()) && /\s[–—]\s|\s-\s/.test(openingLine) && /\b(?:Engineer|Developer|Scientist|Architect|Lead)\b/.test(openingLine)) defects.push("opens with a job title run into a sentence (a dash after the title)");
  // A bare title sentence ("Staff Software Engineer, AI Tooling at Airwallex.") is not a proper opening.
  if (title && company && new RegExp(`(^|\\n\\n|[.!?]\\s+)\\s*${(title.split(/[,(–-]/)[0].trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.\\n]{0,60}\\bat ${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.,\\u2013\\u2014]`, "i").test(text)) defects.push("repeats the job title as a bare sentence");
  // The letter is written by the applicant: their own name in the body (outside the sign-off) means it slipped into the third person.
  const applicantName = (candidateName || "").trim();
  if (applicantName) {
    // The sign-off name, contact lines and salutation are not the body.
    const body = text.trim().split(/\n+/).filter((line) => line.trim() !== applicantName && !/@|\||^\+?\d[\d\s-]{6,}$|^(?:sincerely|regards|kind regards|best regards|yours)/i.test(line.trim())).join("\n");
    if (new RegExp(`\\b${applicantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(body.replace(/^Dear[^\n]*\n/i, ""))) defects.push("refers to the applicant by name in the body (third person)");
  }
  // "Alex built ..." (first name as a sentence subject) is also the third person.
  {
    const first = (candidateName || "").trim().split(/\s+/)[0];
    if (first && first.length > 2 && new RegExp(`(^|\\n|[.!?]\\s+|,\\s+)${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[a-z]`).test(visible.replace(/^Dear[^\n]*\n/i, "")) && !defects.some((d) => d.includes("third person"))) defects.push("refers to the applicant by name in the body (third person)");
  }
  // "As Decagon's Agent Deployment Engineer, I ..." gives the applicant the employer's own job; "I propose an AI Software Engineer ..." talks about the applicant as a product.
  if (/\bAs [A-Z][\w&.-]*'s (?:[A-Z][\w/-]*\s?){1,6},\s+I\b/.test(text)) defects.push("opens as the employer's own employee ('As Company's Title, I ...')");
  if (/\bI (?:propose|present|offer|submit) (?:myself as )?(?:an? )?(?:[A-Z][\w/-]*\s){1,4}(?:Engineer|Developer|Scientist|Architect|Analyst)\b/.test(text)) defects.push("talks about the applicant as a role ('I propose an ... Engineer') instead of applying for it");
  // Stock filler says nothing about the applicant and reads as mass-produced.
  const stock = text.match(/\bI am (?:so |very )?(?:excited|thrilled|delighted|passionate)\b|\bwhat sets me apart\b|\bproven (?:ability|track record|experience|expertise|record|leadership|end-to-end)\b|\bdeep expertise\b|\bcutting-edge\b|\bbridge the gap\b/i);
  if (stock) defects.push(`uses stock filler ("${stock[0].toLowerCase()}") instead of specific experience`);
  // "As Senior Software Engineer for AI Tooling, I led..." uses the posting's own title as past experience.
  if (title) {
    const core = title.split(/[,(–]|\s-\s/)[0].replace(/^(?:senior|staff|lead|principal|junior)\s+/i, "").trim();
    if (core.length > 4 && new RegExp(`\\bAs (?:an? |the )?(?:senior |staff |lead |principal )?${core.replace(/\s*\/\s*/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\s*\\/\\s*")}(?: for [A-Za-z/ ]{3,30})?(?: at [A-Z][\\w&. -]{1,40})?,\\s+I\\b`, "i").test(text.replace(/^[^\n]*\n+/, ""))) defects.push("uses the job title as past experience ('As <title>, I ...')");
  }
  // "In the same organization, I built <project>" credits a personal project to an employer.
  if (/\bIn the same (?:organi[sz]ation|company|team|role)\b/i.test(text)) defects.push("says 'in the same organization' and so credits a separate project to an employer");
  if (WORDS(text) > 400) defects.push("too long: keep it under 350 words, one letter only");
  const name = (candidateName || "").trim();
  if (/\bcandidate\b/i.test(text)) defects.push("calls the applicant a 'candidate'");
  if (!isWellFormedLetter(text)) defects.push("is missing punctuation (commas)");
  if (/^\s*Dear[^\n]*\n+\s*In this role\b/i.test(text)) defects.push("opens with 'In this role' instead of naming the role and company");
  if (/\bcandidate\s+[A-Z][a-z]+/.test(text) || (name && new RegExp(`candidate\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text))) defects.push("refers to the applicant as 'candidate'");
  if (/(^|\n)\s*(com|org|net|au)(\/\S+)?\s*$/i.test(text.trim())) defects.push("truncated link");
  const trimmed = visible.trim();
  if (!/^(dear|hello|hi|to the|greetings)\b/i.test(trimmed)) defects.push("does not open with a greeting such as 'Dear Hiring Manager,'");
  const lastLine = trimmed.split(/\n+/).pop() || "";
  if (!/^(sincerely|regards|kind regards|best regards|yours|thank you)\b/i.test(lastLine) && lastLine.split(/\s+/).length > 6) defects.push("has no sign-off with the applicant's name");
  if (company && !trimmed.toLowerCase().includes(company.toLowerCase().replace(/\b(pty|ltd|limited|inc)\b\.?/g, "").trim())) defects.push(`never names ${company}`);
  if (title) {
    const key = title.toLowerCase().split(/[\s\-\/,&]+/).filter((word) => word.length > 3 && !["senior", "staff", "lead", "principal"].includes(word)).slice(0, 2);
    if (key.length && !key.some((word) => trimmed.toLowerCase().includes(word))) defects.push(`never names the ${title} role`);
  }
  return defects;
}

/** Drops sentences that assert unsupported terms; returns null when that would leave too little of a letter. */
export function stripUnsupportedSentences(text: string, terms: string[], company?: string): string | null {
  if (!terms.length) return text;
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z"\u201C])/).map((sentence) => `${sentence} `);
    return sentences.filter((sentence) => !terms.some((term) => term.startsWith("echo: ") ? normalise(sentence).replace(/[^a-z0-9+#' -]/g, " ").replace(/\s+/g, " ").includes(term.slice(6)) : term.startsWith("posting term: ") ? extractTechTerms(sentence).has(term.slice(14)) : term.startsWith("claims a history with the employer: ") ? normalise(sentence).includes(normalise(term.slice(35))) : (term.startsWith("project as employer: ") ? new RegExp(`\\b(?:at|with|for)\\s+(?:the\\s+)?${term.slice(21).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence) : findUnsupportedClaims(sentence, null, company).includes(term)))).join("").trim();
  }).filter(Boolean);
  const stripped = paragraphs.join("\n\n");
  return stripped.split(/\s+/).length >= 120 ? stripped : null;
}

const name_ = (value?: string) => (value || "").trim();

/** Deterministic fixes for slips a retry cannot be trusted to remove: greeting, sign-off, and "My CV shows" filler. */
export function repairLetterStructure(text: string, candidateName?: string, company?: string, title?: string): string {
  // One fix can expose another (a split paragraph puts a sign-off block above the closing sentence), so repair until nothing changes.
  let current = repairLetterStructureOnce(text, candidateName, company, title);
  for (let pass = 0; pass < 3; pass += 1) {
    const next = repairLetterStructureOnce(current, candidateName, company, title);
    if (next === current) break;
    current = next;
  }
  return current;
}

function repairLetterStructureOnce(text: string, candidateName?: string, company?: string, title?: string): string {
  let fixed = text.trim().replace(/\bMy (?:CV|resume|profile) (?:shows|demonstrates|indicates) (?:that )?I\b/gi, "I");
  // "As Decagon's Agent Deployment Engineer, I deliver ..." gives the applicant the employer's own job: open with the application instead.
  if (title && company) {
    const first = company.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    fixed = fixed.replace(new RegExp(`^(Dear[^\\n]*\\n+)As ${first}[\\w&.-]*'s (?:[A-Z][\\w/-]*\\s?){1,6},\\s+I\\s+`), (_m, lead) => `${lead}I am applying for the ${title} role at ${company}. I `);
  }
  // "..., directly aligning with your need for enterprise-grade AI" is the posting talking: cut the clause and keep the experience.
  fixed = fixed.replace(/,\s*(?:directly )?(?:matching|meeting|fulfilling|addressing|aligning with) your (?:needs?|requirements?)\b[^.\n]*(?=\.)/gi, "");
  // A whole sentence that only says the experience "directly aligns with Airwallex's need for ..." is the posting talking: drop it.
  fixed = fixed.replace(/(^|\n\n|(?<=[.!?])\s+)(?:My|The|This) (?:experience|background|work|skills?)[^.\n]{0,160}? (?:directly )?(?:aligns?|matches|meets|addresses|fulfils?|fulfills?) (?:with )?(?:[A-Z][\w&.-]*'s|your|the) (?:needs?|requirements?)\b[^.\n]*\.[ \t]*/g, (_m, lead) => (lead.includes("\n") ? lead : lead ? " " : ""));
  // "AI Software Engineer at Axion Solutions who architected ..." has no verb of its own: it is the applicant introducing themselves.
  fixed = fixed.replace(/(^|\n\n|(?<=[.!?])[ \t]+)((?:(?:AI|ML|Senior|Staff|Lead|Principal|Junior) )*(?:(?:Software|Machine Learning|Data|AI|Full[- ]Stack|Backend|Frontend) )*(?:Engineer|Developer|Scientist|Architect|Researcher|Analyst)) (at [A-Z][\w&.-]*(?: [A-Z][\w&.-]*){0,3}) (who|with)\b/g, (_m, lead, role, where, link) => `${lead}I am ${/^[AEIOU]/.test(role) ? "an" : "a"} ${role} ${where} ${link}`);
  // "proven experience" / "proven ability" / "a proven track record" is stock filler: say the same thing without it.
  fixed = fixed.replace(/\bproven (?=experience|ability|track record|expertise|record|leadership|end-to-end)/gi, "");
  // The greeting always sits on its own line followed by a blank line.
  fixed = fixed.replace(/^(Dear [^\n]{2,60},)[ \t]*\n(?!\n)/i, "$1\n\n");
  // "I where I architected ..." is a garbled "In that role, I architected ...".
  fixed = fixed.replace(/\bI (?:where|which|who) I\b/g, "In that role, I");
  // "I as an AI Engineer at Axion I led ..." is a garbled "As an AI Engineer at Axion, I led ...".
  fixed = fixed.replace(/\bI as (an? [^,.\n]{3,60}?) I (?=[a-z]+(?:ed|t)\b)/g, "As $1, I ");
  // Stock filler that can be dropped without changing the facts.
  fixed = fixed.replace(/\bI am (?:so |very )?(?:excited|thrilled|delighted) to apply\b/gi, "I am applying").replace(/\b(proven|deep|extensive) (ability|track record|expertise)\b/gi, "$2").replace(/\bcutting-edge /gi, "");
  // A bare title sentence ("Senior Software Engineer, AI Tooling at Airwallex.") adds nothing after the opening sentence.
  if (title && company) {
    const lead = title.split(/[,(\u2013]|\s-\s/)[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const co = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (lead.length > 4) {
      // "Staff Software Engineer, AI Tooling at Airwallex - as AI Software Engineer at Axion, I led ..." keeps the real experience.
      fixed = fixed.replace(new RegExp(`(\\.\\s+)${lead}[^.\\n]{0,60}\\bat ${co}\\s*[-\\u2013\\u2014]\\s*as\\b`, "g"), "$1As");
      fixed = fixed.replace(new RegExp(`(\\.\\s+)${lead}[^.\\n]{0,60}\\bat ${co}\\s*[-\\u2013\\u2014]\\s*([a-z]+)`, "g"), (_m, lead2, word) => (/(?:ed|t)$/.test(word) ? `${lead2}I ${word}` : `${lead2}${word.charAt(0).toUpperCase()}${word.slice(1)}`));
      fixed = fixed.replace(new RegExp(`(\\.\\s+)${lead}[^.\\n]{0,60}\\bat ${co}\\.[ \\t]*(?=\\S)`, "g"), "$1");
    }
  }
  // A letterhead (name and contact lines) between two greetings is dropped together with the first greeting.
  fixed = fixed.replace(/^Dear [^\n]{2,60},[ \t]*\n+(?:[^\n@|]{2,40}\n(?:[^\n]*[@|][^\n]*\n)?[ \t]*\n+)(?=Dear )/i, "");
  // Email-style "Subject:" lines and a repeated greeting are not part of the letter.
  fixed = fixed.replace(/^[ \t]*Subject:[^\n]*\n+/gim, "");
  fixed = fixed.replace(/^(Dear [^\n]{2,60},)[ \t]*\n+(?:Dear [^\n]{2,60},[ \t]*\n+)+/i, "$1\n\n");
  // A greeting run into the first sentence ("Dear Hiring Manager, I am writing...") gets its own line.
  fixed = fixed.replace(/^(Dear [^,\n]{2,60},)[ \t]+(?=[A-Z])/, "$1\n\n");
  // "As Senior Engineer at Acme, I built X" claims the posting's job as past experience: keep the work, drop the borrowed title.
  if (title) {
    const core = title.split(/[,(–]|\s-\s/)[0].replace(/^(?:senior|staff|lead|principal|junior)\s+/i, "").trim();
    if (core.length > 4) {
      const escCore = core.replace(/\s*\/\s*/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\s*\\/\\s*");
      const escCompany = (company || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      fixed = fixed.replace(new RegExp(`(^|\\n\\n|[.!?]\\s+)As (?:an? |the )?(?:senior |staff |lead |principal )?${escCore}(?: for [A-Za-z/ ]{3,30})?(?: at ${escCompany || "\\S+"})?,\\s+I\\b`, "gi"), "$1I");
    }
  }
  // "In the same organization, I built X" would credit a separate project to an employer.
  fixed = fixed.replace(/\bIn the same (?:organi[sz]ation|company|team|role),?\s+I\b/gi, "I also");
  // "Senior Software Engineer - AI Platform at Xero, I designed ..." claims the posting's job as the applicant's own: keep the work.
  if (company) {
    const escCo = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    fixed = fixed.replace(new RegExp(`(^|\\n\\n|[.!?]\\s+)((?:[A-Z][\\w/&]*[ ,\\u2013-]+){1,8})at ${escCo},\\s+(?=I\\b)`, "g"), (match, lead, phrase) => (/\b(?:Engineer|Developer|Scientist|Architect|Manager|Lead|Analyst)\b/.test(phrase) && !/^(?:As|At|In)\b/.test(phrase.trim()) ? lead : match));
  }
  // "I at Xero: I designed ..." is a stray label: keep the sentence, drop the label.
  fixed = fixed.replace(/\bI at [A-Z][\w&.-]*(?: [A-Z][\w&.-]*)?:\s+I\b/g, "I");
  // A company name the model garbled ("Airwalexecss" for "Airwallex") is put back, when the stem is unmistakable.
  if (company && company.length >= 6) {
    const stem = company.slice(0, 6).toLowerCase();
    const companyWord = company.split(/\s+/)[0];
    fixed = fixed.replace(/\b[A-Za-z]{5,}\b/g, (word) => (word.toLowerCase().startsWith(stem) && word.toLowerCase() !== companyWord.toLowerCase() && !company.toLowerCase().includes(word.toLowerCase()) && Math.abs(word.length - companyWord.length) <= 4 ? companyWord : word));
  }
  // "Alex Tester designed and built X" slipped into the third person: a plain past-tense (or simple present) verb after the name becomes first person.
  if (name_(candidateName)) {
    const esc1 = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const firstName = name_(candidateName).split(/\s+/)[0];
    const escName = firstName && firstName.length > 2 && firstName !== name_(candidateName) ? `(?:${esc1(name_(candidateName))}|${esc1(firstName)})` : esc1(name_(candidateName));
    const present: Record<string, string> = { is: "am", has: "have", brings: "bring", builds: "build", leads: "lead", designs: "design", delivers: "deliver", develops: "develop", owns: "own", drives: "drive", architects: "architect", ships: "ship", creates: "create", implements: "implement", engineers: "engineer" };
    const irregular = new Set(["built", "led", "ran", "wrote", "made", "drove", "shipped", "spearheaded", "owned", "was", "had"]);
    fixed = fixed.replace(new RegExp(`(^|\\n\\n|[.!?]\\s+|,\\s+)${escName}\\s+([a-z]+)\\b`, "g"), (match, lead, verb) => {
      if (/^(?:applying|writing|submitting)$/.test(verb)) return match;
      if (verb === "was") return `${lead}I was`;
      if (verb === "had") return `${lead}I had`;
      if (/ed$/.test(verb) || irregular.has(verb)) return `${lead}I ${verb}`;
      if (present[verb]) return `${lead}I ${present[verb]}`;
      return match;
    });
    // A name block (name and contact lines) above the closing sentence belongs at the very end, with any sign-off word that precedes it.
    const blocks = fixed.split(/\n{2,}/);
    const at = blocks.findIndex((block, index) => index > 0 && index < blocks.length - 1 && block.trim().split("\n")[0].trim().toLowerCase() === name_(candidateName).toLowerCase());
    // The same block with the sign-off word and name together ("Best regards,\nName") sitting above the closing sentence.
    const signed = at > 0 || !name_(candidateName) ? -1 : blocks.findIndex((block, index) => index > 0 && index < blocks.length - 1 && new RegExp(`^(?:sincerely|regards|kind regards|best regards|yours(?: sincerely| faithfully)?|warm regards)[,.]?\\s*\\n\\s*${name_(candidateName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\n[^\\n]*)*$`, "i").test(block.trim()));
    if (signed > 0) fixed = [...blocks.filter((_, index) => index !== signed), blocks[signed]].join("\n\n");
    else if (at > 0) {
      const moving = /^(sincerely|regards|kind regards|best regards|yours)\b/i.test(blocks[at - 1].trim()) ? blocks.splice(at - 1, 2) : blocks.splice(at, 1);
      fixed = [...blocks, ...moving].join("\n\n");
    }
  }
  // "Alex Tester is applying for ..." slipped into the third person: put it back in the first.
  if (name_(candidateName)) fixed = fixed.replace(new RegExp(`(^|\\n\\n|[.!?]\\s+)${name_(candidateName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is (applying|writing|submitting)\\b`, "g"), (_m, lead, verb) => `${lead}I am ${verb}`);
  // A generic salutation is always "Dear Hiring Manager," (the model drifts to "Dear Recruiter" or "Dear Hiring Team" with no comma).
  fixed = fixed.replace(/^Dear (?:Recruiter|Recruiting Team|Hiring Team|Hiring Committee|Sir or Madam|Sir\/Madam)[ \t]*,?[ \t]*(?=\n|$)/i, "Dear Hiring Manager,");
  if (!/^(dear|hello|hi|to the|greetings)\b/i.test(fixed)) fixed = `Dear Hiring Manager,\n\n${fixed}`;
  // The opening must say which role at which company this is for, in the posting's own words.
  // "Senior Engineer at Xero - led development of..." is a title run into the first sentence: turn it into a real opening.
  if (title && company) {
    const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const run = new RegExp(`^(Dear[^\\n]*\\n+)${esc(title)}(?:[^.\\n]{0,30}?\\bat ${esc(company)})?[ ,\\u2013-]+`, "i");
    const match = fixed.match(run);
    if (match) {
      const rest = fixed.slice(match[0].length);
      const lead = /^[a-z]+ed\b/.test(rest) ? "I " : /^I\b|^[A-Z]/.test(rest) ? "" : "I ";
      fixed = `${match[1]}I am applying for the ${title} role at ${company}. ${lead}${rest}`;
    }
  }
  const plain = (value: string) => value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const opening = plain(fixed.slice(0, 400));
  const titleSeen = plain(title || "").length > 0 && opening.includes(plain(title || "")) ;
  const companySeen = company ? opening.includes(plain(company).replace(/\b(pty|ltd|limited|inc)\b/g, "").trim()) : true;
  if (company && title && (!titleSeen || !companySeen) && !/\bappl(?:y|ying)\b/i.test(fixed.slice(0, 300))) {
    fixed = fixed.replace(/^(Dear[^\n]*\n+)/i, `$1I am applying for the ${title} role at ${company}. `);
  }
  // A name run onto the end of the last sentence ("...further. Dang Khoa Le") becomes a proper sign-off.
  const nm = name_(candidateName);
  if (nm) fixed = fixed.replace(new RegExp(`([.!?])[ \\t]*\\n?[ \\t]*(${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[ \\t]*$`), "$1\n\nSincerely,\n$2");
  // Chat-style closers add nothing; a second closing paragraph repeats the first.
  const chatLine = /^(Let me know|Feel free|Happy to|Let's discuss|Thank you for (your|considering))/i;
  const blocks0 = fixed.split(/\n{2,}/).filter((block) => !chatLine.test(block.trim()) || WORDS(block) > 40);
  const isCloser = (block: string) => WORDS(block) < 40 && /\b(welcome|look forward|looking forward|discuss)\b/i.test(block);
  const kept: string[] = [];
  for (const block of blocks0) {
    if (isCloser(block) && kept.length && isCloser(kept[kept.length - 1])) kept[kept.length - 1] = block;
    else kept.push(block);
  }
  fixed = kept.join("\n\n");
  // Contact details belong under the name, not in a body sentence.
  const contact = /(?:\+?\d[\d ()-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.]+)/;
  fixed = fixed.split(/\n{2,}/).map((block, index) => {
    if (index === 0 || !contact.test(block)) return block;
    if (/^\s*[\d+(]|@/.test(block.trim()) && block.trim().split(/\s+/).length < 12) return block;
    return block.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => !contact.test(sentence)).join(" ");
  }).filter((block) => block.trim()).join("\n\n");
  // One wall of text is split at sentence boundaries into paragraphs of about 55-80 words.
  fixed = fixed.split(/\n{2,}/).map((block) => {
    if (WORDS(block) <= 110 || /^\s*(dear|sincerely|regards)\b/i.test(block)) return block;
    const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z])/);
    if (sentences.length < 3) return block;
    const chunks: string[] = [];
    let current: string[] = [];
    for (const sentence of sentences) {
      current.push(sentence);
      if (WORDS(current.join(" ")) >= 55) { chunks.push(current.join(" ")); current = []; }
    }
    if (current.length) { if (chunks.length && WORDS(current.join(" ")) < 25) chunks[chunks.length - 1] += ` ${current.join(" ")}`; else chunks.push(current.join(" ")); }
    return chunks.join("\n\n");
  }).join("\n\n");
  // A letter should end on a closing sentence before the sign-off.
  const bodyParagraphs = fixed.split(/\n{2,}/);
  const bodyOnly = bodyParagraphs.filter((block) => WORDS(block) > 3 && !/^(sincerely|regards|kind regards|best regards)/i.test(block.trim()) && !contact.test(block) && block.trim().toLowerCase() !== name_(candidateName).toLowerCase());
  const lastBody = bodyOnly[bodyOnly.length - 1] || "";
  if (lastBody && !/\b(welcome|look forward|looking forward|discuss|opportunity|speak|talk)\b/i.test(bodyOnly.slice(-2).join(" ").slice(-500))) {
    const signIndex = bodyParagraphs.findIndex((block) => /^\s*(sincerely|regards)\b/i.test(block));
    const closing = `I would welcome the opportunity to discuss how my experience fits the ${title ? `${title} role` : "role"}${company ? ` at ${company}` : ""}.`;
    const nameBlockIndex = name_(candidateName) ? bodyParagraphs.findIndex((block) => block.trim().toLowerCase().startsWith(name_(candidateName).toLowerCase())) : -1;
    const at = signIndex >= 0 ? signIndex : nameBlockIndex >= 0 ? nameBlockIndex : bodyParagraphs.length;
    bodyParagraphs.splice(at, 0, closing);
    fixed = bodyParagraphs.join("\n\n");
  }
  const name = (candidateName || "").trim();
  const lines = fixed.split(/\n+/);
  const tail = lines.slice(-3).join(" ").toLowerCase();
  if (name && !new RegExp(`\\b${name.toLowerCase().split(/\\s+/).slice(-1)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(tail) && !/\b(sincerely|regards|yours)\b/i.test(tail)) fixed = `${fixed}\n\nSincerely,\n${name}`;
  // The first paragraph must say which role at which company this is for; a letter that opens "I seek to apply my experience ..." does not.
  if (title && company) {
    const blocksNow = fixed.split(/\n{2,}/);
    const firstBody = blocksNow.findIndex((block, index) => index > 0 && block.trim());
    const companyWord = company.trim().split(/\s+/)[0].toLowerCase();
    // A sentence that starts "This platform ..." right after the opening has nothing to refer to: drop it.
    if (firstBody > 0) {
      const sentences = blocksNow[firstBody].trim().split(/(?<=[.!?])\s+/);
      const orphan = /^(?:This|These|That|Those|It|Such|Its)\b(?!\s+(?:role|position|opportunity|company|team|posting|job))/;
      const at = /^I am applying\b/.test(sentences[0]) ? 1 : 0;
      if (sentences.length > at + 1 && orphan.test(sentences[at]) && (at === 1 || !blocksNow[firstBody].toLowerCase().includes(companyWord))) {
        sentences.splice(at, 1);
        blocksNow[firstBody] = sentences.join(" ");
        fixed = blocksNow.join("\n\n");
      }
    }
    if (firstBody > 0 && !blocksNow[firstBody].toLowerCase().includes(companyWord)) {
      const sentences = blocksNow[firstBody].trim().split(/(?<=[.!?])\s+/);
      if (sentences.length > 1 && /^(?:This|These|That|Those|It|Such|Its)\b/.test(sentences[0])) blocksNow[firstBody] = sentences.slice(1).join(" ");
    }
    if (firstBody > 0 && !blocksNow[firstBody].toLowerCase().includes(companyWord) && !/^(?:sincerely|regards|kind regards|best regards|yours)\b/i.test(blocksNow[firstBody].trim())) {
      blocksNow[firstBody] = `I am applying for the ${title} role at ${company}. ${blocksNow[firstBody].trim()}`;
      fixed = blocksNow.join("\n\n");
    }
  }
  return fixed;
}

export type CoverLetterAgentResult = {
  text: string;
  model: string;
  mode: "standard" | "advanced";
  indices: number[];
  reviewWarning?: string;
  /** Terms or credentials the letter still asserts that the profile does not support. */
  unsupportedClaims?: string[];
  /** Set when the advanced agent was requested but the standard letter was written instead. */
  fallbackNote?: string;
};

/** Writes and evidence-checks a cover letter for one job. `advanced` runs the multi-step agent used by the /generate studio. */
export async function runCoverLetterAgent(args: {
  profile?: Partial<Profile> | null;
  company: string;
  title: string;
  jobDescription: string;
  advanced?: boolean;
  /** Time the advanced agent may use before the standard letter is written instead. */
  advancedBudgetMs?: number;
  clarificationContext?: string;
  signal?: AbortSignal;
}): Promise<CoverLetterAgentResult> {
  const startedAt = Date.now();
  // Every refinement step is skipped once the time budget is spent, so a letter is always returned inside the caller's limit.
  const within = (ms: number) => Date.now() - startedAt < ms;
  const allItems = getCoverLetterItems(args.profile);
  const contact = getCoverLetterContactDetails(args.profile);
  const jobText = `${args.title} at ${args.company}\n${args.jobDescription.slice(0, 6000) || args.title}`;
  const selected = await selectEvidenceForJob(allItems, jobText, args.signal);

  let text = "";
  let model = "";
  let mode: "standard" | "advanced" = "standard";
  let fallbackNote: string | undefined;
  let indices = selected.map((item) => item.index);

  if (args.advanced) {
    try {
      const advanced = await generateAdvancedCoverLetter({
        clarificationContext: args.clarificationContext,
        signal: args.signal ? AbortSignal.any([args.signal, AbortSignal.timeout(args.advancedBudgetMs ?? 150_000)]) : AbortSignal.timeout(args.advancedBudgetMs ?? 150_000),
        candidateName: args.profile?.name,
        company: args.company,
        jobDescription: jobText,
        contactLines: contact.promptLines,
        allItems,
        initialItems: selected,
        preset: "easy",
      });
      text = advanced.text;
      model = "advanced-agent";
      mode = "advanced";
      indices = advanced.selectedIndices;
    } catch (error) {
      if (args.signal?.aborted) throw error;
      fallbackNote = "The advanced agent ran out of time, so the standard cover letter agent wrote this letter.";
    }
  }

  if (!text) {
    const prompt = buildCoverLetterPrompt({
      candidateName: args.profile?.name || "",
      company: args.company,
      jobDescription: jobText,
      contactLines: contact.promptLines,
      prioritizedItems: selected,
      clarificationContext: args.clarificationContext,
    });
    // Two drafts on the same primary chain run side by side (the draft step takes seconds, so no wall time is added);
    // the draft with the fewest unsupported claims and structural defects is kept, the nearer to 230 words on a tie.
    const settled = await Promise.allSettled([generateLetterText(prompt, args.signal), generateLetterText(prompt, args.signal)]);
    if (args.signal?.aborted) throw new Error("Cover letter generation was cancelled.");
    const drafts = settled.flatMap((result) => (result.status === "fulfilled" && result.value.text ? [result.value] : []));
    if (!drafts.length) {
      const failure = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      throw failure?.reason instanceof Error ? failure.reason : new Error("No model returned a cover letter.");
    }
    const score = (draft: { text: string }) => findUnsupportedClaims(draft.text, args.profile, args.company, jobText, args.title).length + findLetterDefects(repairLetterStructure(draft.text, args.profile?.name, args.company, args.title), args.profile?.name, args.company, args.title).length;
    const generated = drafts.reduce((best, draft) => (score(draft) < score(best) || (score(draft) === score(best) && Math.abs(WORDS(draft.text) - 230) < Math.abs(WORDS(best.text) - 230)) ? draft : best));
    text = generated.text;
    model = generated.model;
  }

  // The prompt for a redraw that must avoid what the guards found in the previous draft.
  const buildRetryPrompt = (unsupportedTerms: string[], defectList: string[]) => buildCoverLetterPrompt({
        candidateName: args.profile?.name || "",
        company: args.company,
        jobDescription: jobText,
        contactLines: contact.promptLines,
        prioritizedItems: selected,
        clarificationContext: `${args.clarificationContext || ""}\n${unsupportedTerms.length ? `Remove or avoid these unsupported items: ${unsupportedTerms.map((term) => term.startsWith("echo: ") ? `wording copied from the job posting ("${term.slice(6)}")` : term.startsWith("degree field: ") ? `the degree field "${term.slice(14)}", which the education record does not give (state only the degree the CV names)` : term.startsWith("posting term: ") ? `the tool or acronym "${term.slice(14)}", which is only in the job posting and never in the applicant's CV` : term).join("; ")}. Never copy sentences from the job posting, never claim knowledge of or work on the employer's own products, blog or systems, and never state a degree field, years of experience, durations or tools the evidence does not give.` : ""}${defectList.length ? ` The previous draft ${defectList.join("; ")}. Write in the first person ("I"), at least ${TARGET_MIN_WORDS} words, and end with the plain name only.` : ""}`.trim(),
  });
  // Deterministic guard: terms and credentials absent from the profile are rewritten away, never shipped.
  let unsupported = findUnsupportedClaims(text, args.profile, args.company, jobText, args.title);
  for (let round = 0; round < 1 && within(50_000) && (unsupported.length || findLetterDefects(text, args.profile?.name, args.company, args.title).length); round += 1) {
    const roundDefects = findLetterDefects(text, args.profile?.name, args.company, args.title);
    try {
      const retryPrompt = buildRetryPrompt(unsupported, roundDefects);
      const retried = await generateLetterText(retryPrompt, args.signal);
      const retriedUnsupported = findUnsupportedClaims(retried.text, args.profile, args.company, jobText, args.title).length;
      const retriedDefects = findLetterDefects(retried.text, args.profile?.name, args.company, args.title).length;
      if (retriedUnsupported + retriedDefects < unsupported.length + roundDefects.length) text = retried.text;
    } catch (error) {
      if (args.signal?.aborted) throw error;
    }
    unsupported = findUnsupportedClaims(text, args.profile, args.company, jobText, args.title);
  }
  for (let groundRound = 0; groundRound < 2; groundRound += 1) {
    if (groundRound > 0 && (!within(35_000) || !(findUnsupportedClaims(text, args.profile, args.company, jobText, args.title).length || findLetterDefects(text, args.profile?.name, args.company, args.title).length))) break;
  // Grounding pass: an editor with the whole CV removes or rewords anything a job requirement put in the applicant's mouth.
  try {
    if (!within(50_000)) throw new Error("letter time budget spent");
    const facts = allItems.map((item) => `- [${item.type === "project" ? "PROJECT, not an employer" : "EMPLOYMENT"}] ${item.title}: ${[item.summary, item.description].filter(Boolean).join(" ").slice(0, 420)}`).join("\n").slice(0, 14000);
    const grounded = await generateLetterText(`You are a strict fact-checker and editor of a job application letter. Every statement about the applicant must be directly supported by the CV FACTS below. Items marked PROJECT are personal or academic projects, never employers: never write "At <project name>". Job requirements, tools, responsibilities and phrases from the job posting are NOT facts about the applicant, even if the letter states them as experience.

Rewrite the letter so that:
1. Any claim not supported by the CV FACTS is deleted or reworded to what the CV actually shows (for example, remove on-call, incident response, mentoring, security, serverless, Go or other tools or duties the CV does not state).
2. Text that merely repeats the job posting's wording as the applicant's experience is replaced with a real example from the CV.
3. It opens "Dear Hiring Manager," then states the role (${args.title}) and company (${args.company}) in the first sentence, in the first person ("I"), never calling the applicant a candidate.
4. It is 220 to 320 words in three or four short paragraphs separated by blank lines, ends with a short sign-off and the applicant's name only, and adds no new facts.

CV FACTS:
${facts}

LETTER:
${text}

Return only the corrected letter text.`, args.signal, { models: GROUNDING_MODELS, timeoutMs: GROUNDING_CALL_TIMEOUT_MS });
    const before = findUnsupportedClaims(text, args.profile, args.company, jobText, args.title).length + findLetterDefects(text, args.profile?.name, args.company, args.title).length;
    const after = findUnsupportedClaims(grounded.text, args.profile, args.company, jobText, args.title).length + findLetterDefects(grounded.text, args.profile?.name, args.company, args.title).length;
    if (isWellFormedLetter(grounded.text) && WORDS(grounded.text) >= TARGET_MIN_WORDS && WORDS(grounded.text) <= 400 && after <= before) text = grounded.text;
  } catch (error) {
    if (args.signal?.aborted) throw error;
  }
  }
  unsupported = findUnsupportedClaims(text, args.profile, args.company, jobText, args.title);
  // Unsupported sentences always go: a fabricated claim is worse than a short letter.
  if (unsupported.length) text = stripUnsupportedSentences(text, unsupported, args.company) ?? text;
  // The model evidence check takes seconds and only reads the finished letter. When the verifier below leaves the letter as it is
  // (the usual case) its result is reused, so the check overlaps the verifier instead of following it.
  const finalise = (value: string) => repairLetterStructure(value, args.profile?.name, args.company, args.title).replace(/\n+\s*(?:com|org|net|au)(?:\/\S+)?\s*$/i, "").trim();
  const speculativeText = finalise(text);
  const runClaimCheck = (draft: string) => checkDraftClaims({ draft, candidateName: args.profile?.name, evidence: allItems, clarificationContext: args.clarificationContext, signal: args.signal }).catch(() => ({ reviewWarning: undefined as string | undefined }));
  const speculativeCheck = within(85_000) ? runClaimCheck(speculativeText) : undefined;
  // Independent verifier: a second pass, on a different preset, lists sentences that are not supported by the CV,
  // copy the posting, or use the job title as experience. Those sentences are removed when the letter stays long enough.
  if (within(85_000)) {
    try {
      const facts = allItems.map((item) => `- [${item.type === "project" ? "PROJECT" : "EMPLOYMENT"}] ${item.title}: ${[item.summary, item.description].filter(Boolean).join(" ").slice(0, 380)}`).join("\n").slice(0, 12000);
      const verdict = (await generateJsonSafe("hard", `You verify a job application letter against the applicant's CV. Return only JSON: {"issues":[{"sentence":"<exact sentence copied from the letter>","reason":"<short>"}]}.

Flag a sentence when it: states an experience, employer, figure, tool or qualification that the CV FACTS do not contain; copies or closely paraphrases the job posting as the applicant's experience; uses the job title as if it were experience ("As an <title>, I..."); or attaches a figure or result to the wrong project. Do not flag normal first-person phrasing that the facts support.

JOB TITLE: ${args.title}
CV FACTS:
${facts}

LETTER:
${text}`, 0, args.signal ? AbortSignal.any([args.signal, AbortSignal.timeout(VERIFIER_TIMEOUT_MS)]) : AbortSignal.timeout(VERIFIER_TIMEOUT_MS))) as { issues?: Array<{ sentence?: unknown }> };
      const sentences = (Array.isArray(verdict?.issues) ? verdict.issues : []).map((issue) => (typeof issue?.sentence === "string" ? issue.sentence.trim() : "")).filter((value) => value.length > 20);
      if (sentences.length) {
        const norm = (value: string) => value.replace(/\s+/g, " ").trim();
        // Prune inside each paragraph so the letter keeps its paragraph breaks.
        const pruned = text
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !sentences.some((bad) => norm(sentence).includes(norm(bad).slice(0, 60)))).join(" ").trim())
          .filter(Boolean)
          .join("\n\n");
        // Invented detail is worse than a short letter: prune down to the honest minimum, and the short letter is flagged to the applicant.
        if (WORDS(pruned) >= MIN_HONEST_WORDS && isWellFormedLetter(pruned)) text = pruned;
      }
    } catch (error) {
      if (args.signal?.aborted) throw error;
    }
  }
  // Still too short after the retries: ask the model to extend its own draft using only the evidence already in it.
  if (WORDS(text) < MIN_HONEST_WORDS && within(100_000)) {
    try {
      const expanded = await generateLetterText(`Extend this cover letter to between 220 and 300 words. Keep every fact, the first-person voice, the greeting and sign-off, and use three or four paragraphs separated by blank lines. Add detail only by elaborating on what the letter already says about the applicant's work, and explain more specifically why the applicant is a fit for ${args.company}'s ${args.title} role. Do not add any new tools, degrees, employers or numbers.\n\nLETTER:\n${text}`, args.signal);
      if (isWellFormedLetter(expanded.text) && WORDS(expanded.text) > WORDS(text) && WORDS(expanded.text) <= 380 && findUnsupportedClaims(expanded.text, args.profile, args.company, jobText, args.title).length === 0) text = expanded.text;
    } catch (error) {
      if (args.signal?.aborted) throw error;
    }
  }
  text = repairLetterStructure(text, args.profile?.name, args.company, args.title);
  text = text.replace(/\n+\s*(?:com|org|net|au)(?:\/\S+)?\s*$/i, "").trim();
  // Last chance for a letter the guards still object to: one more draft that is told exactly what to avoid, kept only if it scores better.
  if (!args.advanced && within(FINAL_REDRAW_START_MS)) {
    const leftover = (value: string) => ({
      unsupported: findUnsupportedClaims(value, args.profile, args.company, jobText, args.title),
      defects: findLetterDefects(value, args.profile?.name, args.company, args.title).filter((defect) => !defect.startsWith("too short")),
    });
    const current = leftover(text);
    if (current.unsupported.length + current.defects.length > 0) {
      try {
        // Two redraws side by side (the wall time of one); the one with the fewest findings is kept, and only if it beats the current letter.
        const retryPrompt = buildRetryPrompt(current.unsupported, current.defects);
        const redraws = await Promise.allSettled([generateLetterText(retryPrompt, args.signal), generateLetterText(retryPrompt, args.signal)]);
        if (args.signal?.aborted) throw new Error("Cover letter generation was cancelled.");
        let best: { text: string; model: string; findings: number } | undefined;
        for (const result of redraws) {
          if (result.status !== "fulfilled" || !result.value.text) continue;
          let candidate = finalise(result.value.text);
          const candidateUnsupported = findUnsupportedClaims(candidate, args.profile, args.company, jobText, args.title);
          if (candidateUnsupported.length) candidate = finalise(stripUnsupportedSentences(candidate, candidateUnsupported, args.company) ?? candidate);
          const next = leftover(candidate);
          const findings = next.unsupported.length + next.defects.length;
          if (isWellFormedLetter(candidate) && WORDS(candidate) >= MIN_HONEST_WORDS && (!best || findings < best.findings || (findings === best.findings && Math.abs(WORDS(candidate) - 230) < Math.abs(WORDS(best.text) - 230)))) best = { text: candidate, model: result.value.model, findings };
        }
        if (best && best.findings < current.unsupported.length + current.defects.length) {
          text = best.text;
          model = best.model || model;
        }
      } catch (error) {
        if (args.signal?.aborted) throw error;
      }
    }
  }
  const remaining = findUnsupportedClaims(text, args.profile, args.company, jobText, args.title);
  const leftoverDefects = findLetterDefects(text, args.profile?.name, args.company, args.title).filter((defect) => !defect.startsWith("too short"));
  // A short letter is honest when the profile gives little to draw on; say so instead of padding it with invented duties.
  const thinNote = WORDS(text) < TARGET_MIN_WORDS ? "the letter is short because your profile gives little to draw on for this role: add projects or experience details for a fuller letter" : "";
  const guardWarning = remaining.length ? `Check these before sending, they are not in your profile: ${remaining.map(describeClaim).join("; ")}.` : undefined;

  // The model check sees the whole profile, not only the picked items, so a claim backed by any CV entry is not flagged.
  const { reviewWarning: modelWarning } = await (speculativeCheck && text === speculativeText ? speculativeCheck : runClaimCheck(text));
  const reviewWarning = [guardWarning, modelWarning].filter(Boolean).join(" ") || undefined;
  // A concrete model finding (not "check unavailable") asks the applicant to confirm the letter before approval.
  const modelFinding = modelWarning && !/could not complete the evidence check|some claims could not be verified/i.test(modelWarning) ? modelWarning.replace(/^Please check these potentially unsupported claims against your own experience:\s*/i, "").replace(/\.$/, "") : "";
  return { text, model, mode, indices, reviewWarning, fallbackNote, unsupportedClaims: [...remaining.map(describeClaim), ...leftoverDefects.map((defect) => `the letter ${defect}`), ...(thinNote ? [thinNote] : []), ...(modelFinding ? [modelFinding] : [])] };
}
