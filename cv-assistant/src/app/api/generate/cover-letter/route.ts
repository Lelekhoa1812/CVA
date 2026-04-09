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

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { company, jobDescription, indices } = await req.json();
  if (!company || !jobDescription) return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as DbProfile | undefined;
  const items = getCoverLetterItems(profile);
  const selected = selectCoverLetterItems(items, indices);
  const contactInfo = getCoverLetterContactDetails(profile);
  const prompt = buildCoverLetterPrompt({
    candidateName: profile?.name,
    company,
    jobDescription,
    contactLines: contactInfo.promptLines,
    prioritizedItems: selected,
  });

  type ModelName = 'hard' | 'easy';
  async function tryGenerate(modelName: ModelName) {
    const model = getModel(modelName);
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    return res.response.text().trim();
  }

  try {
    const text = await tryGenerate('hard');
    if (!text) throw new Error('Empty cover letter');
    return NextResponse.json({ coverLetter: text });
  } catch (e1) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const text = await tryGenerate('hard');
      if (!text) throw new Error('Empty cover letter');
      return NextResponse.json({ coverLetter: text });
    } catch (e2) {
      try {
        const text = await tryGenerate('easy');
        if (!text) throw new Error('Empty cover letter');
        return NextResponse.json({ coverLetter: text, fallback: 'easy' });
      } catch (e3) {
        console.error('Cover letter generation failed on all models', { e1, e2, e3 });
        return NextResponse.json({ error: 'Cover letter generation temporarily unavailable. Please try again.' }, { status: 502 });
      }
    }
  }
}
