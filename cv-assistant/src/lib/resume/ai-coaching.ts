import { z } from 'zod';
import { generateJsonSafe, getModel } from '@/lib/ai';
import { MAX_RESUME_ITEMS, MIN_JOB_DESCRIPTION_WORDS } from '@/lib/resume/constants';

export type ResumeProject = {
  name?: string;
  summary?: string;
  description?: string;
};

export type ResumeExperience = {
  companyName?: string;
  role?: string;
  summary?: string;
  description?: string;
  timeFrom?: string;
  timeTo?: string;
};

export type ResumeProfile = {
  projects?: ResumeProject[];
  experiences?: ResumeExperience[];
};

type ResumeItemRef = {
  type: 'project' | 'experience';
  index: number;
  originalOrder: number;
  name: string;
  summary: string;
  description: string;
  originalContent: string;
};

const jdAnalysisSchema = z.object({
  isValid: z.boolean(),
  relevanceReason: z.string().default(''),
  summary: z.string().default(''),
  jobTitle: z.string().default(''),
  industry: z.string().default(''),
  seniority: z.string().default(''),
  mustHaveTechnologies: z.array(z.string()).default([]),
  optionalTechnologies: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  priorities: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      rationale: z.string(),
    }),
  ).default([]),
});

const scoreSchema = z.object({
  score: z.number(),
  directTechnicalMatch: z.number(),
  industryRelevance: z.number(),
  complexityScale: z.number(),
  matchedKeywords: z.array(z.string()).default([]),
  missingSignals: z.array(z.string()).default([]),
  rationale: z.string().default(''),
});

type JDAnalysis = z.infer<typeof jdAnalysisSchema>;
type ScoreDetails = z.infer<typeof scoreSchema>;

type RankedItem = ResumeItemRef & ScoreDetails;

export type AICoachingResult = {
  selectedProjects: number[];
  selectedExperiences: number[];
  contentEnhancementData: Record<string, string>;
  rankedItems: RankedItem[];
  jdAnalysis: JDAnalysis;
};

export class AICoachingValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AICoachingValidationError';
    this.statusCode = statusCode;
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeWhitespace(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function collectResumeItems(profile: ResumeProfile): ResumeItemRef[] {
  const projects = (profile.projects || []).map((project, index) => {
    const summary = normalizeWhitespace(project.summary);
    const description = normalizeWhitespace(project.description);
    return {
      type: 'project' as const,
      index,
      originalOrder: index,
      name: normalizeWhitespace(project.name) || `Project ${index + 1}`,
      summary,
      description,
      originalContent: description || summary,
    };
  });

  const experiences = (profile.experiences || []).map((experience, index) => {
    const summary = normalizeWhitespace(experience.summary);
    const description = normalizeWhitespace(experience.description);
    return {
      type: 'experience' as const,
      index,
      originalOrder: projects.length + index,
      name:
        normalizeWhitespace(`${experience.companyName || ''} ${experience.role || ''}`) ||
        `Experience ${index + 1}`,
      summary,
      description,
      originalContent: description || summary,
    };
  });

  return [...projects, ...experiences];
}

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function analyzeJobDescription(jobDescription: string): Promise<JDAnalysis> {
  const wordCount = jobDescription.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_JOB_DESCRIPTION_WORDS) {
    throw new AICoachingValidationError(
      `Job description is too short. Please add at least ${MIN_JOB_DESCRIPTION_WORDS} words so AI Coaching has enough context.`,
    );
  }

  const raw = await generateJsonSafe(
    'hard',
    `You are a senior resume strategist and career coach.

Analyze the job description and return strict JSON with these exact keys:
{
  "isValid": boolean,
  "relevanceReason": string,
  "summary": string,
  "jobTitle": string,
  "industry": string,
  "seniority": string,
  "mustHaveTechnologies": string[],
  "optionalTechnologies": string[],
  "softSkills": string[],
  "priorities": [{"name": string, "weight": number, "rationale": string}]
}

Rules:
- Decide whether this is a real, usable job description with enough signal for resume tailoring.
- Mark "isValid" false for spam, generic notes, personal statements, or text that is not actually a job description.
- Capture hiring priorities in descending order of importance.
- Put the most important priorities first and assign weights from 1-100.
- Keep all arrays concise and evidence-based.
- Return JSON only.

Job description:
${jobDescription}`,
  );

  const analysis = jdAnalysisSchema.parse(raw);
  if (!analysis.isValid) {
    throw new AICoachingValidationError(
      analysis.relevanceReason || 'The job description does not look specific enough for AI Coaching.',
    );
  }

  return analysis;
}

async function scoreResumeItem(item: ResumeItemRef, analysis: JDAnalysis): Promise<ScoreDetails> {
  const fallback: ScoreDetails = {
    score: 0,
    directTechnicalMatch: 0,
    industryRelevance: 0,
    complexityScale: 0,
    matchedKeywords: [],
    missingSignals: [],
    rationale: 'Scoring failed, so this item was deprioritized.',
  };

  try {
    const raw = await generateJsonSafe(
      'hard',
      `You are both a recruiter and an expert resume career coach.

Score exactly one resume item against the analyzed job description and return strict JSON with these exact keys:
{
  "score": number,
  "directTechnicalMatch": number,
  "industryRelevance": number,
  "complexityScale": number,
  "matchedKeywords": string[],
  "missingSignals": string[],
  "rationale": string
}

Scoring rules:
- Score every field from 0-100.
- Prioritize in this exact order: direct technical match, industry relevance, complexity and scale.
- Only reward evidence that appears in the item itself.
- Do not reward keyword stuffing or inferred experience.
- Favor demonstrated ownership, complexity, systems work, deployment scale, and close JD alignment.
- Keep the rationale concise but specific.
- Return JSON only.

Analyzed job description:
${JSON.stringify(analysis)}

Resume item:
${JSON.stringify({
  type: item.type,
  name: item.name,
  summary: item.summary,
  description: item.description,
  originalContent: item.originalContent,
})}`,
    );

    const parsed = scoreSchema.parse(raw);
    return {
      score: clampScore(parsed.score),
      directTechnicalMatch: clampScore(parsed.directTechnicalMatch),
      industryRelevance: clampScore(parsed.industryRelevance),
      complexityScale: clampScore(parsed.complexityScale),
      matchedKeywords: parsed.matchedKeywords,
      missingSignals: parsed.missingSignals,
      rationale: parsed.rationale,
    };
  } catch (error) {
    console.warn('AI Coaching scoring failed for item:', item.name, error);
    return fallback;
  }
}

function normalizeBulletOutput(text: string, fallbackText: string): string {
  const cleaned = (text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^Here are .*?:/i, '')
    .trim();

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => `- ${line}`);

  if (lines.length > 0) {
    return lines.join('\n');
  }

  return fallbackText;
}

async function rewriteResumeItem(item: RankedItem, analysis: JDAnalysis): Promise<string> {
  if (!item.originalContent.trim()) {
    return '';
  }

  const model = getModel('hard');
  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `You are an expert career coach and ATS resume writer for senior technical candidates.

Rewrite exactly one resume item into 2-3 high-impact bullet points for the target role.

Rules:
- Use strong action verbs such as Architected, Optimized, Spearheaded, Led, Built, or Delivered when they fit the evidence.
- Naturally align to the technical keywords and soft skills in the job description.
- Write STAR-style bullets: show the situation or scope, the action taken, and the result.
- Include quantifiable results only when they already exist in the source content.
- Maintain a concise, professional, high-impact tone.
- Do not invent technologies, metrics, ownership, seniority, scope, outcomes, or domain experience.
- Do not keyword stuff.
- Only rephrase and emphasize achievements that are already supported by the source content.
- Return plain newline-separated bullets only, with no preamble or explanation.

Target job analysis:
${JSON.stringify(analysis)}

Scoring context for this item:
${JSON.stringify({
  score: item.score,
  directTechnicalMatch: item.directTechnicalMatch,
  industryRelevance: item.industryRelevance,
  complexityScale: item.complexityScale,
  matchedKeywords: item.matchedKeywords,
  missingSignals: item.missingSignals,
  rationale: item.rationale,
})}

Resume item:
${JSON.stringify({
  type: item.type,
  name: item.name,
  summary: item.summary,
  description: item.description,
  originalContent: item.originalContent,
})}`,
        }],
      }],
    });

    return normalizeBulletOutput(result.response.text(), item.originalContent);
  } catch (error) {
    console.warn('AI Coaching rewrite failed for item:', item.name, error);
    return item.originalContent;
  }
}

function compareRankedItems(a: RankedItem, b: RankedItem): number {
  return (
    b.score - a.score ||
    b.directTechnicalMatch - a.directTechnicalMatch ||
    b.industryRelevance - a.industryRelevance ||
    b.complexityScale - a.complexityScale ||
    a.originalOrder - b.originalOrder
  );
}

export async function runAICoaching(params: {
  jobDescription: string;
  profile: ResumeProfile;
}): Promise<AICoachingResult> {
  const { jobDescription, profile } = params;
  const items = collectResumeItems(profile);

  if (items.length === 0) {
    throw new AICoachingValidationError('Add at least one project or experience before using AI Coaching.');
  }

  // Motivation vs Logic:
  // Motivation: JD-driven resume coaching needs high-signal, detailed tailoring without overloading the model with
  // every project and experience in one prompt.
  // Logic: We split the workflow into one JD analysis call, one scoring call per item, and one rewrite call per
  // retained item so each project/experience gets focused reasoning, deterministic reranking, and richer bullet output.
  const jdAnalysis = await analyzeJobDescription(jobDescription);

  const rankedItems = await mapWithConcurrencyLimit(items, 3, async (item) => {
    const scores = await scoreResumeItem(item, jdAnalysis);
    return { ...item, ...scores };
  });

  rankedItems.sort(compareRankedItems);
  const retainedItems = rankedItems.slice(0, MAX_RESUME_ITEMS);

  const rewrites = await mapWithConcurrencyLimit(retainedItems, 2, async (item) => {
    const rewrittenContent = await rewriteResumeItem(item, jdAnalysis);
    return [`${item.type}-${item.index}`, rewrittenContent] as const;
  });

  const contentEnhancementData = Object.fromEntries(rewrites);
  const selectedProjects = retainedItems
    .filter((item) => item.type === 'project')
    .map((item) => item.index);
  const selectedExperiences = retainedItems
    .filter((item) => item.type === 'experience')
    .map((item) => item.index);

  return {
    selectedProjects,
    selectedExperiences,
    contentEnhancementData,
    rankedItems,
    jdAnalysis,
  };
}
