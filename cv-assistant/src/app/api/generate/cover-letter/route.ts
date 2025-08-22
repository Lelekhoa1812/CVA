import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { company, jobDescription, indices } = await req.json();
  if (!company || !jobDescription) return NextResponse.json({ error: 'Missing inputs' }, { status: 400 });

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile;
  type Item = { type: 'project' | 'experience'; name: string; description: string; summary: string };
  const items: Item[] = [
    ...((profile?.projects || []).map((p: { name: string; description: string; summary: string }) => ({ type: 'project' as const, name: p.name, description: p.description, summary: p.summary })) ),
    ...((profile?.experiences || []).map((e: { companyName: string; role: string; description: string; summary: string }) => ({ type: 'experience' as const, name: `${e.companyName} - ${e.role}`, description: e.description, summary: e.summary })) ),
  ];
  const selected = Array.isArray(indices) && indices.length ? indices.map((i:number)=>items[i]).filter(Boolean) : items;

  const pro = getModel('gemini-2.5-pro');
  const prompt = `Write a professional, concise cover letter for ${profile?.name || 'the candidate'} applying to ${company}.
Include: education (${profile?.major || ''} at ${profile?.school || ''}), and leverage the following relevant items with emphasis on impact. Avoid generic fluff.

Job Description:\n${jobDescription}

Relevant Items:\n${selected.map((it)=>`- [${it.type}] ${it.name}: ${it.summary || it.description || ''}`).join('\n')}

Format with greeting, 2-3 short paragraphs, bullet highlights if appropriate, and a closing. Keep under 350 words.`;

  const res = await pro.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const text = res.response.text();
  return NextResponse.json({ coverLetter: text });
}


