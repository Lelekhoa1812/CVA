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
  const prompt = `Transform this ${contentType} content into beautiful, professional Markdown format. 

Style preferences: ${JSON.stringify(stylePreferences)}

Rules:
- Use **bold** for key achievements, metrics, and important points
- Use *italic* for technologies, tools, and methodologies
- Keep bullet points concise and impactful
- Maintain professional tone
- Use Markdown syntax: **bold**, *italic*, and bullet points

Original content:
${content}

Return only the Markdown formatted content, no explanations.`;

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
