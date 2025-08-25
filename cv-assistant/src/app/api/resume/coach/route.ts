import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

// Simple coaching endpoint: maintains a short conversation turn-by-turn on the client.
// Request body: { messages: Array<{ role: 'user'|'assistant'|'system', content: string }>, hint?: string }
export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const hint = typeof body?.hint === 'string' ? body.hint : '';

  const system = `You are a direct resume writing coach. Ask exactly 4 comprehensive questions total:

1. TEMPLATE: "What's your preferred font size - smaller (10pt) for more content, or larger (12pt) for readability? Also, do you want any text to be bold or italic for emphasis?"

2. CONTENT DENSITY: "How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded more context and achievements)?"

3. CONTENT: "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8 developers', 'Reduced costs by $50K')"

4. CONTENT: "What specific technologies, tools, and methodologies did you use in your key projects and roles? What were the biggest challenges you overcame and what measurable results did you achieve?"

Keep each question under 100 words. After the 4th question, say: <READY>.

Start with question 1.`;

  const model = getModel('gemini-2.5-flash');
  const parts = [{ text: system + (hint ? `\nAdditional hint: ${hint}` : '') }];
  for (const m of messages) {
    parts.push({ text: `[${m.role}] ${m.content}` });
  }
  const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const text = res.response.text().trim();
  return NextResponse.json({ message: text });
}


