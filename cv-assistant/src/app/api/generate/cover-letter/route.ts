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

  // Build contact information section
  const contactInfo = [];
  if (profile?.name) contactInfo.push(`Name: ${profile.name}`);
  if (profile?.phone) contactInfo.push(`Phone: ${profile.phone}`);
  if (profile?.email) contactInfo.push(`Email: ${profile.email}`);
  if (profile?.website) contactInfo.push(`Website: ${profile.website}`);
  if (profile?.linkedin) contactInfo.push(`LinkedIn: ${profile.linkedin}`);
  if (profile?.languages) contactInfo.push(`Languages: ${profile.languages}`);

  const pro = getModel('gemini-2.5-pro');
  const prompt = `Write a professional, concise cover letter for ${profile?.name || 'the candidate'} applying to ${company}.

      CONTACT INFORMATION (include at the top):
      ${contactInfo.join('\n')}

      EDUCATION:
      ${profile?.major || ''} at ${profile?.school || ''}

      JOB DESCRIPTION:
      ${jobDescription}

      RELEVANT EXPERIENCE & PROJECTS (leverage these with emphasis on impact):
      ${selected.map((it)=>`- [${it.type}] ${it.name}: ${it.summary || it.description || ''}`).join('\n')}

      INSTRUCTIONS:
      - Format with proper greeting, 2-3 focused paragraphs, and professional closing
      - Include the contact information at the top
      - Leverage the relevant items to show specific value and impact
      - Keep under 350 words
      - Avoid generic fluff - be specific and results-oriented
      - Match the tone and style appropriate for the company and role`;

  const res = await pro.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const text = res.response.text();
  return NextResponse.json({ coverLetter: text });
}


