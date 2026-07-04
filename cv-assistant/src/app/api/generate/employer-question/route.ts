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
import { generateAdvancedEmployerAnswer } from '@/lib/cover-letter-advanced';

type ModelName = 'hard' | 'easy';

async function generateWithFallback(prompt: string) {
  async function tryGenerate(modelName: ModelName) {
    const model = getModel(modelName);
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    return res.response.text().trim().replace(/[—–]/g, ',');
  }

  try {
    const text = await tryGenerate('hard');
    if (!text) throw new Error('Empty employer question answer');
    return { text };
  } catch (e1) {
    try {
      await new Promise((r) => setTimeout(r, 500));
      const text = await tryGenerate('hard');
      if (!text) throw new Error('Empty employer question answer');
      return { text };
    } catch (e2) {
      const text = await tryGenerate('easy');
      if (!text) throw new Error('Empty employer question answer');
      return { text, fallback: 'easy' as const, errors: { e1, e2 } };
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const company = typeof body?.company === 'string' ? body.company.trim() : '';
  const jobDescription = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const idealWordCount = typeof body?.idealWordCount === 'string' ? body.idealWordCount.trim() : '';
  const answerStyle = typeof body?.answerStyle === 'string' ? body.answerStyle.trim() : '';
  const indices = Array.isArray(body?.indices) ? body.indices : [];
  const advancedMode = Boolean(body?.advancedMode);

  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as DbProfile | undefined;
  const items = getCoverLetterItems(profile);
  const selected = selectCoverLetterItems(items, indices);

  if (advancedMode) {
    try {
      const advanced = await generateAdvancedEmployerAnswer({
        candidateName: profile?.name,
        company,
        jobDescription,
        question,
        idealWordCount,
        answerStyle,
        allItems: items,
        initialItems: selected,
      });

      return NextResponse.json({
        answer: advanced.text,
        advancedTrace: advanced.trace,
        indices: advanced.selectedIndices,
        advancedMode: true,
      });
    } catch (advancedError) {
      console.error('Advanced employer answer generation failed, falling back to standard mode', advancedError);
    }
  }

  const prompt = buildEmployerQuestionPrompt({
    candidateName: profile?.name,
    company,
    jobDescription,
    question,
    idealWordCount,
    answerStyle,
    prioritizedItems: selected,
  });

  try {
    const result = await generateWithFallback(prompt);
    return NextResponse.json({
      answer: result.text,
      fallback: result.fallback,
      advancedFallback: advancedMode || undefined,
    });
  } catch (error) {
    console.error('Employer question generation failed on all models', error);
    return NextResponse.json(
      { error: 'Employer question answer generation temporarily unavailable. Please try again.' },
      { status: 502 },
    );
  }
}
