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

  const system = `You are a direct resume writing coach. Ask exactly 5 comprehensive questions total:

    1. TEMPLATE: "What's your preferred font size - smaller (10pt) for more content, or larger (12pt) for readability?"

    2. TEMPLATE: "Do you prefer a traditional professional style or a more modern creative layout?"

    3. CONTENT: "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8 developers', 'Reduced costs by $50K')"

    4. CONTENT: "What specific technologies, tools, and methodologies did you use in your key projects and roles?"

    5. CONTENT: "What were the biggest challenges you overcame and what measurable results did you achieve? Include any awards, recognition, or impact metrics."

    Keep each question under 100 words. After the 5th question, say: <READY>.

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


