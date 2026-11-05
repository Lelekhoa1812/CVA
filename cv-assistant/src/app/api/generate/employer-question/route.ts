import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { getModel } from '@/lib/ai';
import {
  buildEmployerQuestionPrompt,
  getCoverLetterItems,
  selectCoverLetterItems,
} from '@/lib/cover-letter';
import { checkDraftClaims } from '@/lib/generate/claim-check';
import { validateGenerationInput } from '@/lib/generate/validation';
import { formatClarificationAnswers, normalizeClarificationAnswers } from '@/lib/generate/clarifications';
import { generateAdvancedEmployerAnswer } from '@/lib/cover-letter-advanced';

type ModelName = 'hard' | 'easy';

async function generateWithFallback(prompt: string, signal: AbortSignal) {
  async function tryGenerate(modelName: ModelName) {
    signal.throwIfAborted();
    const model = getModel(modelName);
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], signal });
    return res.response.text().trim();
  }

  try {
    const text = await tryGenerate('hard');
    if (!text) throw new Error('Empty employer question answer');
    return { text };
  } catch (e1) {
    signal.throwIfAborted();
    try {
      await new Promise((r) => setTimeout(r, 500));
      const text = await tryGenerate('hard');
      if (!text) throw new Error('Empty employer question answer');
      return { text };
    } catch (e2) {
      signal.throwIfAborted();
      const text = await tryGenerate('easy');
      if (!text) throw new Error('Empty employer question answer');
      return { text, fallback: 'easy' as const, errors: { e1, e2 } };
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(240_000)]);
  if (Number(req.headers.get('content-length') || 0) > 100_000) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  const body = await req.json().catch(() => null);
  const company = typeof body?.company === 'string' ? body.company.trim() : '';
  const jobDescription = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const idealWordCount = typeof body?.idealWordCount === 'string' ? body.idealWordCount.trim() : '';
  const answerStyle = typeof body?.answerStyle === 'string' ? body.answerStyle.trim() : '';
  const indices = body?.indices ?? undefined;
  const advancedMode = Boolean(body?.advancedMode);
  const clarificationContext = formatClarificationAnswers(normalizeClarificationAnswers(body?.clarificationAnswers));

  const validationError = validateGenerationInput({ kind: 'employer-question', company, jobDescription, question, idealWordCount, answerStyle, indices });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  let profile: DbProfile | undefined;
  try {
    await connectToDatabase();
    const user = await UserModel.findById(auth.userId).lean();
    profile = user?.profile as DbProfile | undefined;
  } catch {
    if (req.signal.aborted) throw req.signal.reason;
    if (signal.aborted) return NextResponse.json({ error: 'Generation timed out. Please try again.' }, { status: 504 });
    console.error('Unable to load profile for generation');
    return NextResponse.json({ error: 'Unable to load your profile. Please try again.' }, { status: 503 });
  }
  const items = getCoverLetterItems(profile);
  if (indices?.some((index: number) => index >= items.length)) return NextResponse.json({ error: 'Invalid evidence selection' }, { status: 400 });
  const selected = selectCoverLetterItems(items, indices);

  if (advancedMode) {
    try {
      const advanced = await generateAdvancedEmployerAnswer({
        clarificationContext,
        signal,
        candidateName: profile?.name,
        company,
        jobDescription,
        question,
        idealWordCount,
        answerStyle,
        allItems: items,
        initialItems: selected,
      });

      const { reviewWarning } = await checkDraftClaims({ draft: advanced.text, candidateName: profile?.name, evidence: items.filter((item) => advanced.selectedIndices.includes(item.index)), clarificationContext, signal });
      return NextResponse.json({
        reviewWarning,
        answer: advanced.text,
        advancedTrace: advanced.trace,
        indices: advanced.selectedIndices,
        advancedMode: true,
      });
    } catch (advancedError) {
      if (req.signal.aborted) throw req.signal.reason;
      if (signal.aborted) return NextResponse.json({ error: 'Generation timed out. Please try again.' }, { status: 504 });
      console.error('Advanced employer answer generation failed, falling back to standard mode', advancedError);
    }
  }

  const prompt = buildEmployerQuestionPrompt({
    clarificationContext,
    candidateName: profile?.name,
    company,
    jobDescription,
    question,
    idealWordCount,
    answerStyle,
    prioritizedItems: selected,
  });

  try {
    const result = await generateWithFallback(prompt, signal);
    const { reviewWarning } = await checkDraftClaims({ draft: result.text, candidateName: profile?.name, evidence: selected, clarificationContext, signal });
    return NextResponse.json({
      reviewWarning,
      answer: result.text,
      fallback: result.fallback,
      advancedFallback: advancedMode || undefined,
    });
  } catch (error) {
    if (req.signal.aborted) throw req.signal.reason;
    if (signal.aborted) return NextResponse.json({ error: 'Generation timed out. Please try again.' }, { status: 504 });
    console.error('Employer question generation failed on all models', error);
    return NextResponse.json(
      { error: 'Employer question answer generation temporarily unavailable. Please try again.' },
      { status: 502 },
    );
  }
}
