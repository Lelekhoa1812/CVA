import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { getCoverLetterItems, selectCoverLetterItems } from '@/lib/cover-letter';
import { generateJsonSafe } from '@/lib/ai';
import { buildClarificationsPrompt, normalizeClarificationQuestions } from '@/lib/generate/clarifications';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 100_000) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const company = typeof body?.company === 'string' ? body.company.trim() : '';
  const jobDescription = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const answerStyle = typeof body?.answerStyle === 'string' ? body.answerStyle.trim().slice(0, 300) : '';
  const idealWordCount = typeof body?.idealWordCount === 'string' ? body.idealWordCount.trim().slice(0, 100) : '';
  if (company.length > 300 || jobDescription.length > 18000 || question.length > 4000) return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  if ((kind !== 'cover-letter' && kind !== 'employer-question') || (kind === 'cover-letter' && (!company || !jobDescription)) || (kind === 'employer-question' && !question)) {
    return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });
  }
  // The decision step has to finish before drafting. The large model chain does not return
  // inside this window, which is what surfaced "optional questions are unavailable".
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]);
  try {
    await connectToDatabase();
    const user = await UserModel.findById(auth.userId).lean();
    const items = selectCoverLetterItems(getCoverLetterItems(user?.profile as DbProfile | undefined), Array.isArray(body?.indices) ? body.indices.filter((index: unknown) => Number.isInteger(index) && Number(index) >= 0).slice(0, 30) : undefined);
    const prompt = buildClarificationsPrompt({ kind, company, jobDescription, question, items, answerStyle, idealWordCount });
    let questions = normalizeClarificationQuestions(await generateJsonSafe('easy', prompt, 1, signal));
    if (questions.length < 2) {
      questions = normalizeClarificationQuestions(await generateJsonSafe('easy', `${prompt}\n\nThe previous response was rejected because it did not contain 2 to 5 usable questions. Return 2 to 5 now. A behavioral employer question needs both the supplied example to use and the supported aspect to emphasize.`, 0, signal));
    }
    return NextResponse.json({ questions });
  } catch (error) {
    if (req.signal.aborted) throw req.signal.reason;
    console.error('Clarification question generation unavailable', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ questions: [], unavailable: true });
  }
}
