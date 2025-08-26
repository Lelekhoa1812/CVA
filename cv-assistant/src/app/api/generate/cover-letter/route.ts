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
  const profile = user?.profile as any;
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
  if (profile?.workEmail || profile?.email) contactInfo.push(`Email: ${profile.workEmail || profile.email}`);
  if (profile?.website) contactInfo.push(`Website: ${profile.website}`);
  if (profile?.linkedin) contactInfo.push(`LinkedIn: ${profile.linkedin}`);
  if (profile?.languages) contactInfo.push(`Languages: ${profile.languages}`);

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
      - Avoid generic fluff, not markdown, no comments - be specific and results-oriented
      - Match the tone and style appropriate for the company and role`;

  async function tryGenerate(modelName: string) {
    const model = getModel(modelName as any);
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    return res.response.text().trim();
  }

  try {
    // First attempt with pro model
    let text = await tryGenerate('gemini-2.5-pro');
    if (!text) throw new Error('Empty cover letter');
    return NextResponse.json({ coverLetter: text });
  } catch (e1) {
    // Retry once after brief delay
    try {
      await new Promise(r => setTimeout(r, 500));
      let text = await tryGenerate('gemini-2.5-pro');
      if (!text) throw new Error('Empty cover letter');
      return NextResponse.json({ coverLetter: text });
    } catch (e2) {
      // Fallback to flash model
      try {
        let text = await tryGenerate('gemini-2.5-flash');
        if (!text) throw new Error('Empty cover letter');
        return NextResponse.json({ coverLetter: text, fallback: 'flash' });
      } catch (e3) {
        console.error('Cover letter generation failed on all models', { e1, e2, e3 });
        return NextResponse.json({ error: 'Cover letter generation temporarily unavailable. Please try again.' }, { status: 502 });
      }
    }
  }
}


