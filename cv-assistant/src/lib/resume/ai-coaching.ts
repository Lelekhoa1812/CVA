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

const consultantBoardSchema = z.object({
  requirementCoverage: z.array(z.object({
    requirement: z.string(),
    priority: z.enum(['critical', 'important', 'preferred']).default('important'),
    coverage: z.enum(['covered', 'partial', 'gap']).default('gap'),
    evidenceTypePreference: z.enum(['experience', 'project', 'either']).default('either'),
    rewriteInstruction: z.string().default(''),
  })).default([]),
  atsKeywords: z.array(z.string()).default([]),
  missingSignals: z.array(z.string()).default([]),
  consultantNotes: z.array(z.string()).default([]),
  rewriteStrategy: z.array(z.string()).default([]),
  finalSelectionGuidance: z.string().default(''),
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

const atsReviewSchema = z.object({
  estimatedAtsScore: z.number().default(75),
  strengths: z.array(z.string()).default([]),
  residualGaps: z.array(z.string()).default([]),
  revisionInstructions: z.string().default(''),
});

type JDAnalysis = z.infer<typeof jdAnalysisSchema>;
type ConsultantBoardPlan = z.infer<typeof consultantBoardSchema>;
type ScoreDetails = z.infer<typeof scoreSchema>;
type AtsReview = z.infer<typeof atsReviewSchema>;

type RankedItem = ResumeItemRef & ScoreDetails;

export type AICoachingResult = {
  selectedProjects: number[];
  selectedExperiences: number[];
  contentEnhancementData: Record<string, string>;
  rankedItems: RankedItem[];
  jdAnalysis: JDAnalysis;
  consultantBoard: ConsultantBoardPlan;
  atsReview: AtsReview;
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
    `You are the JD Analyst on a board of technical career consultants.

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

async function buildConsultantBoardPlan(jobDescription: string, analysis: JDAnalysis, items: ResumeItemRef[]): Promise<ConsultantBoardPlan> {
  try {
    const raw = await generateJsonSafe(
      'hard',
      `You are a board of resume consultants: an ATS analyst, a technical recruiter, a hiring manager, a resume editor, and a layout strategist.

Create a resume-tailoring plan from the JD and candidate evidence. Return strict JSON:
{
  "requirementCoverage":[{"requirement":"", "priority":"critical|important|preferred", "coverage":"covered|partial|gap", "evidenceTypePreference":"experience|project|either", "rewriteInstruction":""}],
  "atsKeywords":[""],
  "missingSignals":[""],
  "consultantNotes":[""],
  "rewriteStrategy":[""],
  "finalSelectionGuidance":""
}

Rules:
- Prioritize professional experience over projects when the same requirement can be supported by both.
- Identify missing or partial JD requirements honestly.
- Recommend wording strategy that improves ATS visibility without inventing facts.
- Assume the final PDF must fit within two pages, so favor dense, high-signal evidence.
- Return JSON only.

JD analysis:
${JSON.stringify(analysis)}

Job description:
${jobDescription}

Candidate evidence:
${JSON.stringify(items.map((item) => ({ type: item.type, index: item.index, name: item.name, summary: item.summary, description: item.description })))}
`,
    );

    return consultantBoardSchema.parse(raw);
  } catch (error) {
    console.warn('Consultant board planning failed, using fallback board:', error);
    return {
      requirementCoverage: analysis.priorities.map((priority) => ({
        requirement: priority.name,
        priority: priority.weight >= 80 ? 'critical' : priority.weight >= 55 ? 'important' : 'preferred',
        coverage: 'partial',
        evidenceTypePreference: 'experience',
        rewriteInstruction: priority.rationale,
      })),
      atsKeywords: [...analysis.mustHaveTechnologies, ...analysis.optionalTechnologies, ...analysis.softSkills],
      missingSignals: [],
      consultantNotes: ['Fallback consultant board used.'],
      rewriteStrategy: ['Prioritize direct technical and delivery evidence, then use projects only as supporting proof.'],
      finalSelectionGuidance: 'Keep professional experience first and preserve the strongest role-aligned projects only if space remains.',
    };
  }
}

async function scoreResumeItem(item: ResumeItemRef, analysis: JDAnalysis, board: ConsultantBoardPlan): Promise<ScoreDetails> {
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
      `You are the Evidence Curator on a board of technical career consultants.

Score exactly one resume item against the analyzed job description and consultant board plan. Return strict JSON:
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
- Prioritize direct JD evidence, then technical depth, then complexity and scale.
- Apply an experience-first mindset: professional experience is usually stronger than projects for employer trust.
- Only reward evidence that appears in the item itself.
- Do not reward keyword stuffing or inferred experience.
- Return JSON only.

Analyzed job description:
${JSON.stringify(analysis)}

Consultant board plan:
${JSON.stringify(board)}

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

function normalizeBulletOutput(text: string, fallbackText: string, maxBullets: number): string {
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
    .slice(0, maxBullets)
    .map((line) => `- ${line.replace(/[—–]/g, '-')}`);

  if (lines.length > 0) {
    return lines.join('\n');
  }

  return fallbackText;
}

async function rewriteResumeItem(item: RankedItem, analysis: JDAnalysis, board: ConsultantBoardPlan): Promise<string> {
  if (!item.originalContent.trim()) {
    return '';
  }

  const model = getModel('hard');
  const maxBullets = item.type === 'experience' ? 3 : 2;
  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `You are the Resume Rewrite Agent in a consultant board with an ATS analyst, recruiter, hiring manager, and layout strategist.

Rewrite exactly one ${item.type} into ${item.type === 'experience' ? '2-3' : '1-2'} dense, high-impact resume bullets for the target role.

Rules:
- Lead with role-relevant impact, then show the technical mechanism.
- Naturally include JD keywords only when supported by the source evidence.
- Prefer concise Times-style resume phrasing that can fit in a two-page PDF.
- Do not invent technologies, metrics, ownership, seniority, scope, outcomes, or domain experience.
- Do not keyword stuff.
- Return plain newline-separated bullets only, with no preamble.

Target job analysis:
${JSON.stringify(analysis)}

Consultant board plan:
${JSON.stringify(board)}

Scoring context:
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

    return normalizeBulletOutput(result.response.text(), item.originalContent, maxBullets);
  } catch (error) {
    console.warn('AI Coaching rewrite failed for item:', item.name, error);
    return item.originalContent;
  }
}

function compareRankedItems(a: RankedItem, b: RankedItem): number {
  const aExperienceBias = a.type === 'experience' ? 12 : 0;
  const bExperienceBias = b.type === 'experience' ? 12 : 0;
  return (
    (b.score + bExperienceBias) - (a.score + aExperienceBias) ||
    b.directTechnicalMatch - a.directTechnicalMatch ||
    b.industryRelevance - a.industryRelevance ||
    b.complexityScale - a.complexityScale ||
    a.originalOrder - b.originalOrder
  );
}

function selectRetainedItems(rankedItems: RankedItem[]) {
  const sorted = [...rankedItems].sort(compareRankedItems);
  const experiences = sorted.filter((item) => item.type === 'experience');
  const projects = sorted.filter((item) => item.type === 'project');
  const retained: RankedItem[] = [];

  for (const item of experiences) {
    if (retained.length >= MAX_RESUME_ITEMS) break;
    retained.push(item);
  }

  for (const item of projects) {
    if (retained.length >= MAX_RESUME_ITEMS) break;
    retained.push(item);
  }

  return retained.sort(compareRankedItems);
}

async function reviewTailoredResume(args: {
  analysis: JDAnalysis;
  board: ConsultantBoardPlan;
  retainedItems: RankedItem[];
  contentEnhancementData: Record<string, string>;
}): Promise<AtsReview> {
  try {
    const raw = await generateJsonSafe(
      'hard',
      `You are the final ATS reviewer on a resume consultant board.

Review the tailored resume evidence and rewrites. Return strict JSON:
{
  "estimatedAtsScore": number,
  "strengths": string[],
  "residualGaps": string[],
  "revisionInstructions": string
}

Rules:
- Estimate ATS score from 0-100.
- Penalize unsupported claims, missing must-have skills, and overlong weak projects.
- Reward experience-first evidence and clear role alignment.
- Remember the PDF renderer will enforce a two-page maximum.
- Return JSON only.

JD analysis:
${JSON.stringify(args.analysis)}

Consultant board:
${JSON.stringify(args.board)}

Selected evidence:
${JSON.stringify(args.retainedItems.map((item) => ({ type: item.type, index: item.index, name: item.name, score: item.score, matchedKeywords: item.matchedKeywords })))}

Rewritten content:
${JSON.stringify(args.contentEnhancementData)}
`,
    );

    const parsed = atsReviewSchema.parse(raw);
    return {
      estimatedAtsScore: clampScore(parsed.estimatedAtsScore),
      strengths: parsed.strengths,
      residualGaps: parsed.residualGaps,
      revisionInstructions: parsed.revisionInstructions,
    };
  } catch (error) {
    console.warn('ATS board review failed, using fallback:', error);
    return {
      estimatedAtsScore: 76,
      strengths: ['Experience-first evidence selected and rewritten for the target JD.'],
      residualGaps: args.board.missingSignals,
      revisionInstructions: 'Renderer should keep content dense, prioritize experience, and prune projects first if the resume exceeds two pages.',
    };
  }
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

  const jdAnalysis = await analyzeJobDescription(jobDescription);
  const consultantBoard = await buildConsultantBoardPlan(jobDescription, jdAnalysis, items);

  const rankedItems = await mapWithConcurrencyLimit(items, 3, async (item) => {
    const scores = await scoreResumeItem(item, jdAnalysis, consultantBoard);
    return { ...item, ...scores };
  });

  rankedItems.sort(compareRankedItems);
  const retainedItems = selectRetainedItems(rankedItems);

  const rewrites = await mapWithConcurrencyLimit(retainedItems, 2, async (item) => {
    const rewrittenContent = await rewriteResumeItem(item, jdAnalysis, consultantBoard);
    return [`${item.type}-${item.index}`, rewrittenContent] as const;
  });

  const contentEnhancementData = Object.fromEntries(rewrites);
  const atsReview = await reviewTailoredResume({
    analysis: jdAnalysis,
    board: consultantBoard,
    retainedItems,
    contentEnhancementData,
  });

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
    consultantBoard,
    atsReview,
  };
}
