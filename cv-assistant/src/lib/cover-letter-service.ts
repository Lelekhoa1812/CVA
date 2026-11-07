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

/** A letter with no commas across 80+ words is a known degenerate output of some NIM models. */
export function isWellFormedLetter(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 80) return false;
  const commas = (text.match(/,/g) || []).length;
  return commas >= Math.max(2, Math.floor(words / 60));
}

const WORDS = (text: string) => text.split(/\s+/).filter(Boolean).length;
const TARGET_MIN_WORDS = 170;
/** One slow or stalled model must not hold up a whole batch of applications. */
const MODEL_CALL_TIMEOUT_MS = 40_000;
const MAX_EXTRA_ATTEMPTS = 1;

/** Tries each model in turn; returns the first well-formed letter of a proper length, else the best letter seen. */
export async function generateLetterText(prompt: string, signal?: AbortSignal) {
  let best = { text: "", model: "", rank: -1 };
  let attempts = 0;
  for (const model of COVER_LETTER_MODELS) {
    // A usable letter already exists: allow at most one more try for a better one, never the whole chain.
    if (best.rank >= 10_000 && attempts > MAX_EXTRA_ATTEMPTS) break;
    attempts += 1;
    try {
      const callSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS)]) : AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS);
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
  "oauth", "oidc", "typescript", "javascript", "kubernetes", "terraform", "lidar", "graphql", "rust", "golang", "scala", "kafka", "spark", "snowflake", "databricks",
  "salesforce", "sap", "aws", "azure", "gcp", "docker", "react", "angular", "vue", "java", "kotlin", "swift", "c#", ".net", "pytorch", "tensorflow", "langchain",
  "computer science", "systems programming", "threat hunting", "databricks", "master's", "masters", "phd", "doctorate", "mba", "pmp", "cissp", "root-cause analysis", "root cause analysis",
];

function normalise(value: string) {
  return value.toLowerCase().replace(/[‘’]/g, "'");
}

/** Technology, credential and certification terms the letter asserts but the candidate's profile never mentions. */
export function findUnsupportedClaims(text: string, profile?: Partial<Profile> | null, company?: string): string[] {
  const facts = normalise(JSON.stringify(profile || {}));
  const letter = normalise(text);
  const employmentPattern = (name: string) => new RegExp(`\\b(?:at|with|for|joined)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},?\\s+I\\s+(?:\\w+\\s+){0,2}(?:developed|built|led|delivered|designed|shipped|managed|worked|created|implemented)`, "i");
  const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const years = Array.from(letter.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)\+?\s*(?:\+\s*)?years?\b/g)).map((match) => match[0].replace(/\s+/g, " ")).filter((term) => !facts.includes(term));
  const employer = (company || "").trim();
  const employment = employer && !facts.includes(normalise(employer)) && employmentPattern(employer).test(text) ? [`employment at ${employer}`] : [];
  return [...employment, ...[...years, ...CLAIM_LEXICON].filter((term) => new RegExp(`(^|[^a-z0-9+#])${escape(term)}($|[^a-z0-9+#])`).test(letter) && !new RegExp(`(^|[^a-z0-9+#])${escape(term)}($|[^a-z0-9+#])`).test(facts))];
}

/** Structural defects that make a letter unsendable regardless of its claims. */
export function findLetterDefects(text: string, candidateName?: string): string[] {
  const defects: string[] = [];
  if (WORDS(text) < TARGET_MIN_WORDS) defects.push("too short");
  const name = (candidateName || "").trim();
  if (/\bcandidate\s+[A-Z][a-z]+/.test(text) || (name && new RegExp(`candidate\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text))) defects.push("refers to the applicant as 'candidate'");
  if (/(^|\n)\s*(com|org|net|au)(\/\S+)?\s*$/i.test(text.trim())) defects.push("truncated link");
  return defects;
}

/** Drops sentences that assert unsupported terms; returns null when that would leave too little of a letter. */
export function stripUnsupportedSentences(text: string, terms: string[], company?: string): string | null {
  if (!terms.length) return text;
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => {
    const sentences = paragraph.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [paragraph];
    return sentences.filter((sentence) => findUnsupportedClaims(sentence, null, company).filter((term) => terms.includes(term)).length === 0).join("").trim();
  }).filter(Boolean);
  const stripped = paragraphs.join("\n\n");
  return stripped.split(/\s+/).length >= 120 ? stripped : null;
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
  const allItems = getCoverLetterItems(args.profile);
  const contact = getCoverLetterContactDetails(args.profile);
  const jobText = `${args.title} at ${args.company}\n${args.jobDescription.slice(0, 6000) || args.title}`;
  const selected = await selectEvidenceForJob(allItems, jobText, args.signal);

  let text = "";
  let model = "";
  let mode: "standard" | "advanced" = "standard";
  let evidence = selected;
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
      evidence = allItems.filter((item) => advanced.selectedIndices.includes(item.index));
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
    const generated = await generateLetterText(prompt, args.signal);
    text = generated.text;
    model = generated.model;
  }

  // Deterministic guard: terms and credentials absent from the profile are rewritten away, never shipped.
  let unsupported = findUnsupportedClaims(text, args.profile, args.company);
  for (let round = 0; round < 2 && (unsupported.length || findLetterDefects(text, args.profile?.name).length); round += 1) {
    const roundDefects = findLetterDefects(text, args.profile?.name);
    try {
      const retryPrompt = buildCoverLetterPrompt({
        candidateName: args.profile?.name || "",
        company: args.company,
        jobDescription: jobText,
        contactLines: contact.promptLines,
        prioritizedItems: selected,
        clarificationContext: `${args.clarificationContext || ""}\n${unsupported.length ? `The candidate has NO experience with: ${unsupported.join(", ")}. Do not mention these, never state a degree field, years of experience or tools that the evidence does not give.` : ""}${roundDefects.length ? ` The previous draft ${roundDefects.join("; ")}. Write in the first person ("I"), at least ${TARGET_MIN_WORDS} words, and end with the plain name only.` : ""}`.trim(),
      });
      const retried = await generateLetterText(retryPrompt, args.signal);
      const retriedUnsupported = findUnsupportedClaims(retried.text, args.profile, args.company).length;
      const retriedDefects = findLetterDefects(retried.text, args.profile?.name).length;
      if (retriedUnsupported + retriedDefects < unsupported.length + roundDefects.length) text = retried.text;
    } catch (error) {
      if (args.signal?.aborted) throw error;
    }
    unsupported = findUnsupportedClaims(text, args.profile, args.company);
  }
  if (unsupported.length) text = stripUnsupportedSentences(text, unsupported, args.company) ?? text;
  text = text.replace(/\n+\s*(?:com|org|net|au)(?:\/\S+)?\s*$/i, "").trim();
  const remaining = findUnsupportedClaims(text, args.profile, args.company);
  const guardWarning = remaining.length ? `Check these before sending, they are not in your profile: ${remaining.join(", ")}.` : undefined;

  const { reviewWarning: modelWarning } = await checkDraftClaims({ draft: text, candidateName: args.profile?.name, evidence, clarificationContext: args.clarificationContext, signal: args.signal }).catch(() => ({ reviewWarning: undefined as string | undefined }));
  const reviewWarning = [guardWarning, modelWarning].filter(Boolean).join(" ") || undefined;
  return { text, model, mode, indices, reviewWarning, fallbackNote, unsupportedClaims: remaining };
}
