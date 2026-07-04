import { generateJsonSafe, getModel } from '@/lib/ai';
import {
  buildCoverLetterPrompt,
  buildEmployerQuestionPrompt,
  type CoverLetterItem,
} from '@/lib/cover-letter';

type ModelName = 'hard' | 'easy';

type AdvancedRequirement = {
  label: string;
  category: 'skill' | 'qualification' | 'experience' | 'tool' | 'domain' | 'quality' | 'other';
  priority: 'critical' | 'important' | 'preferred';
  covered: boolean;
  matchedEvidenceIndices: number[];
  evidenceGap: string;
  hiringImpact: string;
};

type CoveragePlan = {
  roleFocus: string;
  requirements: AdvancedRequirement[];
  missingCriticalRequirements: string[];
  plannerNotes: string[];
};

type SupplementalEvidence = {
  index: number;
  title: string;
  type: 'project' | 'experience';
  rationale: string;
};

type SupplementalPlan = {
  supplementalEvidence: SupplementalEvidence[];
  uncoveredRequirements: string[];
  retrievalNotes: string[];
};

type SynthesisPlan = {
  positioningStatement: string;
  evidenceStrategy: string[];
  transferableSignals: string[];
  cautionNotes: string[];
};

type ReviewPlan = {
  approved: boolean;
  score: number;
  issues: string[];
  missingRoleSignals: string[];
  revisionInstructions: string;
};

export type AdvancedGenerationTrace = {
  mode: 'advanced';
  roleFocus: string;
  missingCriticalRequirements: string[];
  supplementalEvidenceTitles: string[];
  uncoveredRequirements: string[];
  reviewerNotes: string[];
  finalEvidenceCount: number;
  coverageSummary: string[];
  agentSteps: string[];
};

export type AdvancedCoverLetterResult = {
  text: string;
  selectedIndices: number[];
  trace: AdvancedGenerationTrace;
};

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeOutput(value: string): string {
  return value.trim().replace(/[—–]/g, ',');
}

function uniqNumbers(values: unknown[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const value of values) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numeric) || seen.has(numeric)) continue;
    seen.add(numeric);
    normalized.push(numeric);
  }

  return normalized;
}

function mergeUniqueText(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    for (const item of group) {
      const clean = safeText(item);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      merged.push(clean);
    }
  }

  return merged;
}

function formatEvidence(items: CoverLetterItem[]): string {
  if (!items.length) return 'No candidate evidence was supplied.';

  return items
    .map(
      (item) => `${item.index}. ${item.title}
Type: ${item.type}
Summary: ${item.summary || 'None provided'}
Description: ${item.description || 'None provided'}`,
    )
    .join('\n\n');
}

function parseRequirement(raw: unknown): AdvancedRequirement | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const label = safeText(entry.label || entry.requirement);
  if (!label) return null;

  const category = safeText(entry.category).toLowerCase();
  const priority = safeText(entry.priority).toLowerCase();

  return {
    label,
    category:
      category === 'skill' ||
      category === 'qualification' ||
      category === 'experience' ||
      category === 'tool' ||
      category === 'domain' ||
      category === 'quality'
        ? category
        : 'other',
    priority: priority === 'critical' || priority === 'preferred' ? priority : 'important',
    covered: Boolean(entry.covered),
    matchedEvidenceIndices: uniqNumbers(Array.isArray(entry.matchedEvidenceIndices) ? entry.matchedEvidenceIndices : []),
    evidenceGap: safeText(entry.evidenceGap),
    hiringImpact: safeText(entry.hiringImpact),
  };
}

function normalizeCoveragePlan(parsed: unknown): CoveragePlan {
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const requirements = Array.isArray(source.requirements)
    ? source.requirements.map(parseRequirement).filter((item): item is AdvancedRequirement => Boolean(item))
    : [];
  const missingCriticalRequirements = Array.isArray(source.missingCriticalRequirements)
    ? source.missingCriticalRequirements.map(safeText).filter(Boolean)
    : requirements.filter((item) => !item.covered && item.priority === 'critical').map((item) => item.label);

  return {
    roleFocus: safeText(source.roleFocus) || 'Role-aligned cover letter positioning',
    requirements,
    missingCriticalRequirements,
    plannerNotes: Array.isArray(source.plannerNotes) ? source.plannerNotes.map(safeText).filter(Boolean) : [],
  };
}

function normalizeSupplementalPlan(parsed: unknown, items: CoverLetterItem[], alreadySelected: Set<number>): SupplementalPlan {
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const rawSupplemental = Array.isArray(source.supplementalEvidence) ? source.supplementalEvidence : [];
  const supplementalEvidence = rawSupplemental
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const payload = entry as Record<string, unknown>;
      const numericIndex = Number(payload.index);
      const item = items.find((candidate) => candidate.index === numericIndex);
      if (!item || alreadySelected.has(item.index)) return null;
      return {
        index: item.index,
        title: item.title,
        type: item.type,
        rationale: safeText(payload.rationale) || 'Additional evidence selected to close a role-fit gap.',
      } satisfies SupplementalEvidence;
    })
    .filter((entry): entry is SupplementalEvidence => Boolean(entry))
    .sort((a, b) => {
      if (a.type === b.type) return a.index - b.index;
      return a.type === 'experience' ? -1 : 1;
    })
    .slice(0, 4);

  return {
    supplementalEvidence,
    uncoveredRequirements: Array.isArray(source.uncoveredRequirements)
      ? source.uncoveredRequirements.map(safeText).filter(Boolean)
      : [],
    retrievalNotes: Array.isArray(source.retrievalNotes) ? source.retrievalNotes.map(safeText).filter(Boolean) : [],
  };
}

function normalizeSynthesisPlan(parsed: unknown): SynthesisPlan {
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return {
    positioningStatement: safeText(source.positioningStatement) || 'Position the candidate around the role requirements with grounded proof.',
    evidenceStrategy: Array.isArray(source.evidenceStrategy) ? source.evidenceStrategy.map(safeText).filter(Boolean) : [],
    transferableSignals: Array.isArray(source.transferableSignals) ? source.transferableSignals.map(safeText).filter(Boolean) : [],
    cautionNotes: Array.isArray(source.cautionNotes) ? source.cautionNotes.map(safeText).filter(Boolean) : [],
  };
}

function normalizeReviewPlan(parsed: unknown): ReviewPlan {
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const score = Number(source.score);
  return {
    approved: Boolean(source.approved),
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 75,
    issues: Array.isArray(source.issues) ? source.issues.map(safeText).filter(Boolean) : [],
    missingRoleSignals: Array.isArray(source.missingRoleSignals) ? source.missingRoleSignals.map(safeText).filter(Boolean) : [],
    revisionInstructions: safeText(source.revisionInstructions),
  };
}

async function jsonAgent<T>(prompt: string, normalize: (parsed: unknown) => T, fallback: T): Promise<T> {
  try {
    return normalize(await generateJsonSafe('hard', prompt, 1));
  } catch {
    return fallback;
  }
}

async function textAgent(prompt: string): Promise<string> {
  const attempts: ModelName[] = ['hard', 'hard', 'easy'];
  let lastError: unknown = null;

  for (const [index, modelName] of attempts.entries()) {
    try {
      if (index === 1) await new Promise((resolve) => setTimeout(resolve, 500));
      const model = getModel(modelName);
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      const text = sanitizeOutput(result.response.text());
      if (text) return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Advanced generation failed');
}

function buildCoveragePlannerPrompt(jobDescription: string, selectedItems: CoverLetterItem[], mode: 'planner' | 'auditor' = 'planner'): string {
  const title = mode === 'planner' ? 'Requirement Coverage Planner agent' : 'Final Coverage Auditor agent';
  const task =
    mode === 'planner'
      ? "Deeply inspect the job description against the candidate evidence currently selected for the cover letter. Identify the role's important skills, qualifications, experiences, technologies, domain signals, and personal qualities. Mark which ones are covered by the selected evidence and which ones are still missing."
      : 'Re-audit the final evidence set after supplemental retrieval. Be stricter than the writer: decide which JD requirements are directly covered, which can only be framed as transferable, and which remain unsupported.';

  return `You are the ${title} for an AI job-application system.

Task:
${task}

Job Description:
${jobDescription}

Candidate Evidence Under Review:
${formatEvidence(selectedItems)}

Rules:
- Be strict. If the evidence only weakly implies a requirement, mark it uncovered and explain the gap.
- Treat must-have requirements, repeated requirements, and core delivery responsibilities as critical.
- Do not invent candidate facts.
- Do not downgrade important technical stacks or qualities just because they are missing.
- If a requirement is only transferable, mark it uncovered but explain the transferable bridge in evidenceGap.

Return only valid JSON with this exact shape:
{
  "roleFocus":"one sentence role-fit thesis",
  "requirements":[{"label":"requirement", "category":"skill|qualification|experience|tool|domain|quality|other", "priority":"critical|important|preferred", "covered":true, "matchedEvidenceIndices":[0], "evidenceGap":"gap if uncovered", "hiringImpact":"why this matters"}],
  "missingCriticalRequirements":["critical requirement not covered"],
  "plannerNotes":["brief planning note"]
}`;
}

function buildSupplementalEvidencePrompt(args: {
  jobDescription: string;
  coveragePlan: CoveragePlan;
  allItems: CoverLetterItem[];
  selectedItems: CoverLetterItem[];
  retrievalRound: number;
}): string {
  const selectedIndices = new Set(args.selectedItems.map((item) => item.index));
  const candidates = args.allItems.map((item) => ({ ...item, alreadySelected: selectedIndices.has(item.index) }));

  return `You are the Evidence Retrieval tool-agent. Your job is to search the candidate's other experiences and projects for truthful evidence that can close the uncovered role-fit gaps found by the planner.

Retrieval round: ${args.retrievalRound}
Prioritize professional experiences before projects. Select only evidence that is actually relevant to the missing requirements. It is acceptable to select no extra evidence if the profile does not support the gap.

Job Description:
${args.jobDescription}

Coverage Planner Output:
${JSON.stringify(args.coveragePlan, null, 2)}

Full Candidate Evidence Library:
${formatEvidence(candidates)}

Rules:
- Prefer experience evidence over project evidence when both are relevant.
- Do not select evidence already marked as selected unless there is no alternative.
- Do not invent skills, tech stacks, employers, degrees, tools, certifications, or metrics.
- If a JD skill can only be addressed as transferable or adjacent, say so in the rationale.
- Select evidence that can improve hiring fit, not just keyword overlap.

Return only valid JSON with this exact shape:
{
  "supplementalEvidence":[{"index":3,"title":"Evidence title", "rationale":"why it closes a gap"}],
  "uncoveredRequirements":["requirement still not supported by any evidence"],
  "retrievalNotes":["brief retrieval note"]
}`;
}

function buildSynthesisPrompt(args: {
  jobDescription: string;
  initialCoveragePlan: CoveragePlan;
  finalCoveragePlan: CoveragePlan;
  supplementalPlan: SupplementalPlan;
  finalItems: CoverLetterItem[];
}): string {
  return `You are the Evidence Synthesiser agent. Create a compact strategy brief for the final writing agent.

Job Description:
${args.jobDescription}

Initial Coverage Plan:
${JSON.stringify(args.initialCoveragePlan, null, 2)}

Final Coverage Audit:
${JSON.stringify(args.finalCoveragePlan, null, 2)}

Supplemental Evidence Plan:
${JSON.stringify(args.supplementalPlan, null, 2)}

Final Evidence Set:
${formatEvidence(args.finalItems)}

Rules:
- Turn the evidence into a hiring-manager-friendly narrative strategy.
- Highlight JD technologies, skills, qualities, and responsibilities only when they are supported by evidence.
- If a requirement is not directly supported, propose a cautious transferable framing instead of pretending direct experience.
- Maximize fit by surfacing truthful adjacent skills, tech stacks, qualities, and achievements the employer is likely screening for.
- Keep it concise.

Return only valid JSON with this exact shape:
{
  "positioningStatement":"one sentence thesis",
  "evidenceStrategy":["how to use specific evidence"],
  "transferableSignals":["truthful adjacent skill or quality to emphasize"],
  "cautionNotes":["facts not to overclaim"]
}`;
}

function buildAdvancedCoverLetterPrompt(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  contactLines: string[];
  finalItems: CoverLetterItem[];
  coveragePlan: CoveragePlan;
  supplementalPlan: SupplementalPlan;
  synthesisPlan: SynthesisPlan;
}): string {
  const basePrompt = buildCoverLetterPrompt({
    candidateName: args.candidateName,
    company: args.company,
    jobDescription: args.jobDescription,
    contactLines: args.contactLines,
    prioritizedItems: args.finalItems,
  });

  return `${basePrompt}

Advanced Mode Planning Context:
Role-fit thesis: ${args.synthesisPlan.positioningStatement}
Final coverage audit: ${JSON.stringify(args.coveragePlan.requirements.slice(0, 12), null, 2)}
Supplemental evidence selected: ${JSON.stringify(args.supplementalPlan.supplementalEvidence, null, 2)}
Evidence strategy: ${args.synthesisPlan.evidenceStrategy.join('\n') || 'Use the strongest selected evidence directly.'}
Transferable signals to emphasize carefully: ${args.synthesisPlan.transferableSignals.join('\n') || 'None'}
Caution notes: ${args.synthesisPlan.cautionNotes.join('\n') || 'Do not overclaim unsupported requirements.'}

Advanced Mode Instructions:
- This is not a one-shot generic letter. Write as the final executor after planner, evidence-retrieval, final coverage audit, synthesis, and reviewer preparation.
- Address the employer's most important role signals explicitly, including missing-but-transferable skills when evidence supports an adjacent framing.
- Maximize hiring fit while staying truthful to the supplied evidence.
- If a critical requirement remains unsupported, avoid claiming it directly; instead, emphasize the closest credible experience, learning agility, or adjacent capability.
- Output only the final cover letter.`;
}

function buildAdvancedEmployerAnswerPrompt(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  question: string;
  idealWordCount?: string;
  answerStyle?: string;
  finalItems: CoverLetterItem[];
  coveragePlan: CoveragePlan;
  supplementalPlan: SupplementalPlan;
  synthesisPlan: SynthesisPlan;
}): string {
  const basePrompt = buildEmployerQuestionPrompt({
    candidateName: args.candidateName,
    company: args.company,
    jobDescription: args.jobDescription,
    question: args.question,
    idealWordCount: args.idealWordCount,
    answerStyle: args.answerStyle,
    prioritizedItems: args.finalItems,
  });

  return `${basePrompt}

Advanced Mode Planning Context:
Role-fit thesis: ${args.synthesisPlan.positioningStatement}
Final coverage audit: ${JSON.stringify(args.coveragePlan.requirements.slice(0, 10), null, 2)}
Supplemental evidence selected: ${JSON.stringify(args.supplementalPlan.supplementalEvidence, null, 2)}
Evidence strategy: ${args.synthesisPlan.evidenceStrategy.join('\n') || 'Use the strongest selected evidence directly.'}
Transferable signals to emphasize carefully: ${args.synthesisPlan.transferableSignals.join('\n') || 'None'}
Caution notes: ${args.synthesisPlan.cautionNotes.join('\n') || 'Do not overclaim unsupported requirements.'}

Advanced Mode Instructions:
- Answer as the executor after planner, retrieval, final coverage audit, synthesis, and review preparation.
- Make the answer directly responsive to the employer question while using the most role-aligned evidence available.
- Maximize fit, but never invent facts or claim unsupported experience.
- Output only the final answer.`;
}

function buildReviewerPrompt(args: {
  outputKind: 'cover letter' | 'employer answer';
  jobDescription: string;
  draft: string;
  finalItems: CoverLetterItem[];
  coveragePlan: CoveragePlan;
  synthesisPlan: SynthesisPlan;
}): string {
  return `You are the Reviewer agent for an AI job-application system. Audit the draft ${args.outputKind} against the JD, evidence, and planning brief.

Job Description:
${args.jobDescription}

Final Candidate Evidence:
${formatEvidence(args.finalItems)}

Final Coverage Audit:
${JSON.stringify(args.coveragePlan, null, 2)}

Synthesis Plan:
${JSON.stringify(args.synthesisPlan, null, 2)}

Draft ${args.outputKind}:
${args.draft}

Review criteria:
- Does it address the most important employer requirements?
- Does it add relevant missing skills, tools, qualities, or transferable signals when evidence supports them?
- Does it avoid unsupported claims and invented details?
- Is it polished, concise, and hiring-manager-friendly?

Return only valid JSON with this exact shape:
{
  "approved":true,
  "score":90,
  "issues":["specific issue"],
  "missingRoleSignals":["role signal still absent"],
  "revisionInstructions":"compact instructions for the final revision agent"
}`;
}

function buildRevisionPrompt(args: {
  outputKind: 'cover letter' | 'employer answer';
  jobDescription: string;
  draft: string;
  finalItems: CoverLetterItem[];
  coveragePlan: CoveragePlan;
  synthesisPlan: SynthesisPlan;
  reviewPlan: ReviewPlan;
}): string {
  return `You are the Final Revision agent. Improve the draft ${args.outputKind} using the reviewer findings while staying truthful to evidence.

Job Description:
${args.jobDescription}

Final Evidence:
${formatEvidence(args.finalItems)}

Final Coverage Audit:
${JSON.stringify(args.coveragePlan, null, 2)}

Synthesis Plan:
${JSON.stringify(args.synthesisPlan, null, 2)}

Reviewer Findings:
${JSON.stringify(args.reviewPlan, null, 2)}

Draft to revise:
${args.draft}

Rules:
- Fix missing role signals if the evidence supports them.
- If the evidence does not support a critical role signal, use cautious transferable framing only.
- Do not invent facts, tools, companies, education, certifications, or metrics.
- Do not use an em dash or en dash.
- Output only the final ${args.outputKind}.`;
}

function buildFinalItems(initialItems: CoverLetterItem[], supplementalPlan: SupplementalPlan, allItems: CoverLetterItem[]) {
  const supplementalItems = supplementalPlan.supplementalEvidence
    .map((entry) => allItems.find((item) => item.index === entry.index))
    .filter((item): item is CoverLetterItem => Boolean(item));

  return [...initialItems, ...supplementalItems]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.index === item.index) === index)
    .sort((a, b) => {
      if (a.type === b.type) return a.index - b.index;
      return a.type === 'experience' ? -1 : 1;
    })
    .slice(0, 8);
}

async function runSupplementalRetrieval(args: {
  jobDescription: string;
  coveragePlan: CoveragePlan;
  allItems: CoverLetterItem[];
  selectedItems: CoverLetterItem[];
  retrievalRound: number;
}) {
  const selectedIndexSet = new Set(args.selectedItems.map((item) => item.index));
  return jsonAgent(
    buildSupplementalEvidencePrompt(args),
    (parsed) => normalizeSupplementalPlan(parsed, args.allItems, selectedIndexSet),
    {
      supplementalEvidence: [],
      uncoveredRequirements: args.coveragePlan.missingCriticalRequirements,
      retrievalNotes: [`Supplemental retrieval round ${args.retrievalRound} fallback used.`],
    },
  );
}

async function buildAdvancedEvidenceContext(args: {
  jobDescription: string;
  allItems: CoverLetterItem[];
  initialItems: CoverLetterItem[];
}): Promise<{
  coveragePlan: CoveragePlan;
  supplementalPlan: SupplementalPlan;
  synthesisPlan: SynthesisPlan;
  finalItems: CoverLetterItem[];
  finalIndices: number[];
  agentSteps: string[];
}> {
  const initialItems = args.initialItems.length ? args.initialItems : args.allItems;
  const agentSteps: string[] = ['planner: audited JD requirements against initial selected evidence'];

  const initialCoveragePlan = await jsonAgent(
    buildCoveragePlannerPrompt(args.jobDescription, initialItems, 'planner'),
    normalizeCoveragePlan,
    {
      roleFocus: 'Role-aligned cover letter positioning',
      requirements: [],
      missingCriticalRequirements: [],
      plannerNotes: ['Coverage planner fallback used.'],
    },
  );

  const needsSupplementalSearch = initialCoveragePlan.requirements.some((item) => !item.covered && item.priority !== 'preferred');
  let supplementalPlan: SupplementalPlan = needsSupplementalSearch
    ? await runSupplementalRetrieval({
        jobDescription: args.jobDescription,
        coveragePlan: initialCoveragePlan,
        allItems: args.allItems,
        selectedItems: initialItems,
        retrievalRound: 1,
      })
    : { supplementalEvidence: [], uncoveredRequirements: [], retrievalNotes: ['Selected evidence already covers core requirements.'] };
  agentSteps.push('retriever: searched full profile evidence, prioritising experience before projects');

  let finalItems = buildFinalItems(initialItems, supplementalPlan, args.allItems);
  let finalCoveragePlan = await jsonAgent(
    buildCoveragePlannerPrompt(args.jobDescription, finalItems, 'auditor'),
    normalizeCoveragePlan,
    initialCoveragePlan,
  );
  agentSteps.push('auditor: re-checked final evidence coverage after supplemental retrieval');

  const stillNeedsRepair = finalCoveragePlan.requirements.some((item) => !item.covered && item.priority === 'critical');
  if (stillNeedsRepair) {
    const repairPlan = await runSupplementalRetrieval({
      jobDescription: args.jobDescription,
      coveragePlan: finalCoveragePlan,
      allItems: args.allItems,
      selectedItems: finalItems,
      retrievalRound: 2,
    });

    if (repairPlan.supplementalEvidence.length) {
      supplementalPlan = {
        supplementalEvidence: [...supplementalPlan.supplementalEvidence, ...repairPlan.supplementalEvidence]
          .filter((item, index, array) => array.findIndex((candidate) => candidate.index === item.index) === index)
          .slice(0, 6),
        uncoveredRequirements: mergeUniqueText(supplementalPlan.uncoveredRequirements, repairPlan.uncoveredRequirements),
        retrievalNotes: mergeUniqueText(supplementalPlan.retrievalNotes, repairPlan.retrievalNotes),
      };
      finalItems = buildFinalItems(initialItems, supplementalPlan, args.allItems);
      finalCoveragePlan = await jsonAgent(
        buildCoveragePlannerPrompt(args.jobDescription, finalItems, 'auditor'),
        normalizeCoveragePlan,
        finalCoveragePlan,
      );
      agentSteps.push('repair-retriever: added a second-pass evidence search for unresolved critical gaps');
    }
  }

  const synthesisPlan = await jsonAgent(
    buildSynthesisPrompt({
      jobDescription: args.jobDescription,
      initialCoveragePlan,
      finalCoveragePlan,
      supplementalPlan,
      finalItems,
    }),
    normalizeSynthesisPlan,
    {
      positioningStatement: finalCoveragePlan.roleFocus || initialCoveragePlan.roleFocus,
      evidenceStrategy: [],
      transferableSignals: [],
      cautionNotes: mergeUniqueText(finalCoveragePlan.missingCriticalRequirements, supplementalPlan.uncoveredRequirements),
    },
  );
  agentSteps.push('synthesiser: produced final positioning, evidence strategy, and caution notes');

  return {
    coveragePlan: finalCoveragePlan,
    supplementalPlan,
    synthesisPlan,
    finalItems,
    finalIndices: finalItems.map((item) => item.index),
    agentSteps,
  };
}

function buildTrace(args: {
  coveragePlan: CoveragePlan;
  supplementalPlan: SupplementalPlan;
  synthesisPlan: SynthesisPlan;
  reviewPlan: ReviewPlan;
  finalItems: CoverLetterItem[];
  agentSteps: string[];
}): AdvancedGenerationTrace {
  const coverageSummary = args.coveragePlan.requirements.slice(0, 8).map((requirement) => {
    const status = requirement.covered ? 'covered' : 'gap';
    return `${requirement.label} (${status})`;
  });

  return {
    mode: 'advanced',
    roleFocus: args.synthesisPlan.positioningStatement || args.coveragePlan.roleFocus,
    missingCriticalRequirements: args.coveragePlan.missingCriticalRequirements,
    supplementalEvidenceTitles: args.supplementalPlan.supplementalEvidence.map((item) => item.title),
    uncoveredRequirements: mergeUniqueText(args.supplementalPlan.uncoveredRequirements, args.coveragePlan.missingCriticalRequirements),
    reviewerNotes: [
      ...args.reviewPlan.issues,
      ...args.reviewPlan.missingRoleSignals.map((signal) => `Missing role signal: ${signal}`),
    ].filter(Boolean),
    finalEvidenceCount: args.finalItems.length,
    coverageSummary,
    agentSteps: args.agentSteps,
  };
}

export async function generateAdvancedCoverLetter(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  contactLines: string[];
  allItems: CoverLetterItem[];
  initialItems: CoverLetterItem[];
}): Promise<AdvancedCoverLetterResult> {
  const context = await buildAdvancedEvidenceContext({
    jobDescription: args.jobDescription,
    allItems: args.allItems,
    initialItems: args.initialItems,
  });
  const draft = await textAgent(
    buildAdvancedCoverLetterPrompt({
      candidateName: args.candidateName,
      company: args.company,
      jobDescription: args.jobDescription,
      contactLines: args.contactLines,
      finalItems: context.finalItems,
      coveragePlan: context.coveragePlan,
      supplementalPlan: context.supplementalPlan,
      synthesisPlan: context.synthesisPlan,
    }),
  );
  const reviewPlan = await jsonAgent(
    buildReviewerPrompt({
      outputKind: 'cover letter',
      jobDescription: args.jobDescription,
      draft,
      finalItems: context.finalItems,
      coveragePlan: context.coveragePlan,
      synthesisPlan: context.synthesisPlan,
    }),
    normalizeReviewPlan,
    { approved: true, score: 85, issues: [], missingRoleSignals: [], revisionInstructions: '' },
  );
  const shouldRevise = !reviewPlan.approved || reviewPlan.score < 88 || reviewPlan.issues.length > 0;
  const text = shouldRevise
    ? await textAgent(
        buildRevisionPrompt({
          outputKind: 'cover letter',
          jobDescription: args.jobDescription,
          draft,
          finalItems: context.finalItems,
          coveragePlan: context.coveragePlan,
          synthesisPlan: context.synthesisPlan,
          reviewPlan,
        }),
      )
    : draft;

  return {
    text,
    selectedIndices: context.finalIndices,
    trace: buildTrace({
      coveragePlan: context.coveragePlan,
      supplementalPlan: context.supplementalPlan,
      synthesisPlan: context.synthesisPlan,
      reviewPlan,
      finalItems: context.finalItems,
      agentSteps: [...context.agentSteps, shouldRevise ? 'reviewer: requested final revision before delivery' : 'reviewer: approved draft without revision'],
    }),
  };
}

export async function generateAdvancedEmployerAnswer(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  question: string;
  idealWordCount?: string;
  answerStyle?: string;
  allItems: CoverLetterItem[];
  initialItems: CoverLetterItem[];
}): Promise<AdvancedCoverLetterResult> {
  const planningContext = `${args.jobDescription}\n\nEmployer Question:\n${args.question}`;
  const context = await buildAdvancedEvidenceContext({
    jobDescription: planningContext,
    allItems: args.allItems,
    initialItems: args.initialItems,
  });
  const draft = await textAgent(
    buildAdvancedEmployerAnswerPrompt({
      candidateName: args.candidateName,
      company: args.company,
      jobDescription: args.jobDescription,
      question: args.question,
      idealWordCount: args.idealWordCount,
      answerStyle: args.answerStyle,
      finalItems: context.finalItems,
      coveragePlan: context.coveragePlan,
      supplementalPlan: context.supplementalPlan,
      synthesisPlan: context.synthesisPlan,
    }),
  );
  const reviewPlan = await jsonAgent(
    buildReviewerPrompt({
      outputKind: 'employer answer',
      jobDescription: planningContext,
      draft,
      finalItems: context.finalItems,
      coveragePlan: context.coveragePlan,
      synthesisPlan: context.synthesisPlan,
    }),
    normalizeReviewPlan,
    { approved: true, score: 85, issues: [], missingRoleSignals: [], revisionInstructions: '' },
  );
  const shouldRevise = !reviewPlan.approved || reviewPlan.score < 88 || reviewPlan.issues.length > 0;
  const text = shouldRevise
    ? await textAgent(
        buildRevisionPrompt({
          outputKind: 'employer answer',
          jobDescription: planningContext,
          draft,
          finalItems: context.finalItems,
          coveragePlan: context.coveragePlan,
          synthesisPlan: context.synthesisPlan,
          reviewPlan,
        }),
      )
    : draft;

  return {
    text,
    selectedIndices: context.finalIndices,
    trace: buildTrace({
      coveragePlan: context.coveragePlan,
      supplementalPlan: context.supplementalPlan,
      synthesisPlan: context.synthesisPlan,
      reviewPlan,
      finalItems: context.finalItems,
      agentSteps: [...context.agentSteps, shouldRevise ? 'reviewer: requested final revision before delivery' : 'reviewer: approved draft without revision'],
    }),
  };
}
