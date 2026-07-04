import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { getModel } from '@/lib/ai';
import {
  buildCoverLetterPrompt,
  getCoverLetterContactDetails,
  getCoverLetterItems,
  selectCoverLetterItems,
} from '@/lib/cover-letter';
import { generateAdvancedCoverLetter } from '@/lib/cover-letter-advanced';

type ModelName = 'hard' | 'easy';

async function generateWithFallback(prompt: string) {
  async function tryGenerate(modelName: ModelName) {
    const model = getModel(modelName);
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    return res.response.text().trim().replace(/[—–]/g, ',');
  }

  try {
    const text = await tryGenerate('hard');
    if (!text) throw new Error('Empty cover letter');
    return { text };
  } catch (e1) {
    try {
      await new Promise((r) => setTimeout(r, 500));
      const text = await tryGenerate('hard');
      if (!text) throw new Error('Empty cover letter');
      return { text };
    } catch (e2) {
      const text = await tryGenerate('easy');
      if (!text) throw new Error('Empty cover letter');
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
  const indices = Array.isArray(body?.indices) ? body.indices : undefined;
  const advancedMode = Boolean(body?.advancedMode);

  if (!company || !jobDescription) return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as DbProfile | undefined;
  const items = getCoverLetterItems(profile);
  const selected = selectCoverLetterItems(items, indices);
  const contactInfo = getCoverLetterContactDetails(profile);

  if (advancedMode) {
    try {
      const advanced = await generateAdvancedCoverLetter({
        candidateName: profile?.name,
        company,
        jobDescription,
        contactLines: contactInfo.promptLines,
        allItems: items,
        initialItems: selected,
      });

      return NextResponse.json({
        coverLetter: advanced.text,
        advancedTrace: advanced.trace,
        indices: advanced.selectedIndices,
        advancedMode: true,
      });
    } catch (advancedError) {
      console.error('Advanced cover letter generation failed, falling back to standard mode', advancedError);
    }
  }

  const prompt = buildCoverLetterPrompt({
    candidateName: profile?.name,
    company,
    jobDescription,
    contactLines: contactInfo.promptLines,
    prioritizedItems: selected,
  });

  try {
    const result = await generateWithFallback(prompt);
    return NextResponse.json({
      coverLetter: result.text,
      fallback: result.fallback,
      advancedFallback: advancedMode || undefined,
    });
  } catch (error) {
    console.error('Cover letter generation failed on all models', error);
    return NextResponse.json({ error: 'Cover letter generation temporarily unavailable. Please try again.' }, { status: 502 });
  }
}
