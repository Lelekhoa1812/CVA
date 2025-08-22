import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { jobDescription } = await req.json();
  if (!jobDescription) return NextResponse.json({ error: 'Missing jobDescription' }, { status: 400 });
  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile;
  type Item = { type: 'project' | 'experience'; name: string; summary: string };
  const items: Item[] = [
    ...((profile?.projects || []).map((p: { name: string; summary: string }) => ({ type: 'project' as const, name: p.name, summary: p.summary })) ),
    ...((profile?.experiences || []).map((e: { companyName: string; role: string; summary: string }) => ({ type: 'experience' as const, name: `${e.companyName} - ${e.role}`, summary: e.summary })) ),
  ];

  const model = getModel('gemini-2.5-flash-lite');
  const prompt = `Given this job description, select the most relevant items (up to 6) from the user's profile summaries. Return JSON array of indices.
Job Description:\n${jobDescription}\n
Items:\n${items.map((it, i) => `${i}. [${it.type}] ${it.name}: ${it.summary}`).join('\n')}

Return only JSON like {"indices": [0,2,5]}`;

  let indices: number[] = [];
  try {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const text = res.response.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const jsonStr = start>=0 && end>=0 ? text.slice(start, end+1) : text;
    const parsed = JSON.parse(jsonStr);
    indices = Array.isArray(parsed.indices) ? parsed.indices.slice(0,6) : [];
  } catch {
    indices = [];
  }

  return NextResponse.json({ indices, items });
}


