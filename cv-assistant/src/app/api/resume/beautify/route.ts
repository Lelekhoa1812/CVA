import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, contentType, stylePreferences } = await req.json();
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  const model = getModel('gemini-2.5-flash');
  const prompt = `Rewrite the following ${contentType} content by PRESERVING all original facts and wording as much as possible and ONLY INSERTING Markdown emphasis markers:

STRICT RULES:
- Do NOT add new facts.
- Do NOT remove existing facts.
- Do NOT change names, dates, companies, metrics, or technologies.
- Do NOT hallucinate.
- Keep original bullet structure and order.
- You may split long lines into multiple bullets if absolutely necessary, but keep wording.
- Only add Markdown emphasis: use **bold** for key achievements, metrics, and impact; use *italic* for technologies/tools/methodologies.
- Return ONLY the Markdown content, no commentary.

Style preferences: ${JSON.stringify(stylePreferences)}

Original content:
${content}`;

  try {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const formatted = res.response.text().trim();
    
    return NextResponse.json({ 
      formattedContent: formatted,
      hasMarkdown: formatted.includes('**') || formatted.includes('*')
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to beautify content' }, { status: 500 });
  }
}
