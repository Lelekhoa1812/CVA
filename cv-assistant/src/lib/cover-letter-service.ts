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

export type CoverLetterAgentResult = {
  text: string;
  model: string;
  mode: "standard" | "advanced";
  indices: number[];
  reviewWarning?: string;
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

  const { reviewWarning } = await checkDraftClaims({ draft: text, candidateName: args.profile?.name, evidence, clarificationContext: args.clarificationContext, signal: args.signal }).catch(() => ({ reviewWarning: undefined as string | undefined }));
  return { text, model, mode, indices, reviewWarning, fallbackNote };
}
