import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const messages: Array<{ role: string; content: string }> = Array.isArray(body?.messages) ? body.messages : [];
  const hint = typeof body?.hint === 'string' ? body.hint : '';
  const agentType = body?.agentType || 'styling'; // 'styling' or 'content'

  // Styling agent is UI-driven now; no LLM needed

  const contentSystem = `You are a resume content specialist. Ask exactly 2 questions about content enhancement:

1. "How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded with more context and achievements)?"

2. "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8', 'Reduced costs by $50K'). If you don't want to enhance any, reply 'None'."

CRITICAL RULES:
- Ask ONLY ONE question at a time
- Wait for the user's response before asking the next question
- NEVER say <CONTENT_READY> until you have asked BOTH questions and received responses
- After the 2nd question, say: <CONTENT_READY>

STRICT OUTPUT RULES:
- Do NOT return Markdown formatting
- Do NOT include any comments, code fences, or backticks
- Use plain text only
- Bullet points are allowed as plain text lines starting with '-' and separated by new lines

Start with question 1 only.`;

  try {
    if (agentType === 'styling') {
      // Styling handled on client. Return a stable signal for UI.
      return NextResponse.json({ message: '<STYLING_UI>', agentType });
    }

    // Content agent uses LLM
    const model = getModel('gemini-2.5-flash');
    const parts = [{ text: contentSystem + (hint ? `\nAdditional hint: ${hint}` : '') }];
    for (const m of messages as Array<{ role: string; content: string }>) {
      parts.push({ text: `[${m.role}] ${m.content}` });
    }
    const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const text = res.response.text().trim();
    return NextResponse.json({ message: text, agentType });
  } catch (error) {
    console.error('Gemini API error:', error);
    // Minimal fallback for content agent only
    const messageCount = messages.filter(m => m.role === 'user').length;
    const fallbackMessage = messageCount === 0
      ? "How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded with more context and achievements)?"
      : messageCount === 1
      ? "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8 developers', 'Reduced costs by $50K'). If you don't want to enhance any, reply 'None'."
      : "<CONTENT_READY>";
    return NextResponse.json({ message: fallbackMessage, agentType });
  }
}


