import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function GET(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  return NextResponse.json({ profile: user?.profile || null });
}

export async function PUT(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  await connectToDatabase();

  // Generate summaries for new/updated items using flash model
  const model = getModel('gemini-2.5-flash-lite');

  async function summarize(text: string) {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: `Summarize in 1-2 concise sentences, return answer in text-only, no comments, not markdown:
${text}
` }] }] });
    return res.response.text().trim();
  }

  const profile = body;
  if (profile?.projects) {
    for (const p of profile.projects) {
      if (!p.summary || p._needsSummary) {
        p.summary = await summarize(`${p.name}\n${p.description || ''}`);
      }
    }
  }
  if (profile?.experiences) {
    for (const ex of profile.experiences) {
      if (!ex.summary || ex._needsSummary) {
        const timeframe = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`;
        ex.summary = await summarize(`${ex.companyName} - ${ex.role} (${timeframe})\n${ex.description || ''}`);
      }
    }
  }

  const updated = await UserModel.findByIdAndUpdate(auth.userId, { profile }, { new: true, upsert: false });
  return NextResponse.json({ ok: true, profile: updated?.profile || profile });
}


