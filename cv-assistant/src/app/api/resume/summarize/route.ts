import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, contentType } = await req.json();
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  const model = getModel('gemini-2.5-flash-lite');
  const prompt = `Summarize this ${contentType} content to be approximately 50% shorter while maintaining all key achievements, metrics, and important details.

Rules:
- Keep quantified achievements (numbers, percentages, metrics)
- Preserve technologies and tools mentioned
- Maintain professional tone
- Focus on impact and results
- Remove redundant or less important details
- Keep bullet points concise and impactful

Original content:
${content}

Return only the summarized content, no explanations.`;

  try {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const summarized = res.response.text().trim();
    
    return NextResponse.json({ 
      summarizedContent: summarized,
      originalLength: content.length,
      summarizedLength: summarized.length,
      reductionPercentage: Math.round(((content.length - summarized.length) / content.length) * 100)
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to summarize content' }, { status: 500 });
  }
}
