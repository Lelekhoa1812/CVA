import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';
import { buildHighImpactRewritePrompt, normalizeHighImpactBulletOutput } from '@/lib/resume/high-impact-rewrite';

function buildTextSectionPrompt(type: string, content: string) {
  if (type === 'skills') {
    return `You are an expert resume editor.

Rewrite this skills section into a concise, polished skills list for a resume.

Rules:
- Preserve only information grounded in the source text.
- Remove duplicates and normalize tool/framework names.
- Keep it compact and professional.
- Return only the improved skills list as plain text.
- Prefer one comma-separated line unless line breaks clearly improve readability.

Skills source:
${content}`;
  }

  if (type === 'profile') {
    return `You are an expert resume editor.

Rewrite this candidate profile into a concise professional summary suitable for a resume.

Rules:
- Preserve only information grounded in the source text.
- Keep the tone factual, polished, and specific.
- Write a short paragraph, not bullet points.
- Avoid first-person pronouns.
- Return only the improved summary text.

Profile source:
${content}`;
  }

  return '';
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { type, name, description } = await req.json();
  if (!type || !name || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('hard');
    if (type === 'skills' || type === 'profile') {
      const prompt = buildTextSectionPrompt(type, description);
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const enhancedDescription = res.response.text().trim() || description;

      return NextResponse.json({
        enhancedDescription,
        message: `${type} content enhanced successfully`
      });
    }

    const prompt = buildHighImpactRewritePrompt({
      itemType: type,
      itemName: name,
      originalContent: description,
    });

    const res = await model.generateContent({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }] 
    });
    
    const enhancedDescription = normalizeHighImpactBulletOutput(
      res.response.text(),
      description,
    );
    
    return NextResponse.json({ 
      enhancedDescription,
      message: `${type} description enhanced successfully`
    });
    
  } catch (error) {
    console.error('Enhancement error:', error);
    return NextResponse.json({ 
      error: 'Failed to enhance description' 
    }, { status: 500 });
  }
}
