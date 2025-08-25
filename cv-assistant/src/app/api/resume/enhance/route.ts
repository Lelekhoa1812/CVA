import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, contentType, qaContext } = await req.json();
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  const model = getModel('gemini-2.5-flash-lite');
  const prompt = `Enhance and expand this ${contentType} content to be approximately 50% longer while adding more context, achievements, and professional details.

Rules:
- Expand on existing achievements with more context
- Add relevant technical details and methodologies
- Include team dynamics and collaboration aspects
- Enhance with industry-specific terminology
- Maintain professional tone and ATS-friendliness
- Keep bullet points impactful and well-structured
- Use the Q&A context to inform enhancements: ${qaContext || 'No additional context provided'}

Original content:
${content}

Return only the enhanced content, no explanations.`;

  try {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const enhanced = res.response.text().trim();
    
    return NextResponse.json({ 
      enhancedContent: enhanced,
      originalLength: content.length,
      enhancedLength: enhanced.length,
      expansionPercentage: Math.round(((enhanced.length - content.length) / content.length) * 100)
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to enhance content' }, { status: 500 });
  }
}
