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

  const stylingSystem = `You are a resume styling specialist. Ask exactly 3 questions about styling preferences:

1. "What's your preferred font size - smaller (10pt) for more content, or larger (12pt) for readability? Also, do you want any text to be bold or italic for emphasis?"

2. "Do you prefer a traditional professional style or a more modern creative layout?"

3. "Any specific color preferences or section emphasis you'd like to highlight?"

IMPORTANT: Ask ONLY ONE question at a time. Wait for the user's response before asking the next question. After the 3rd question, say: <STYLING_READY>.

Start with question 1 only.`;

  const contentSystem = `You are a resume content specialist. Ask exactly 2 questions about content enhancement:

1. "How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded with more context and achievements)?"

2. "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8', 'Reduced costs by $50K'). If you don't want to enhance any, reply 'None'."

CRITICAL RULES:
- Ask ONLY ONE question at a time
- Wait for the user's response before asking the next question
- NEVER say <CONTENT_READY> until you have asked BOTH questions and received responses
- After the 2nd question, say: <CONTENT_READY>

Start with question 1 only.`;

  try {
    const model = getModel('gemini-2.5-flash-lite');
    const system = agentType === 'styling' ? stylingSystem : contentSystem;
    const parts = [{ text: system + (hint ? `\nAdditional hint: ${hint}` : '') }];
    
    for (const m of messages as Array<{ role: string; content: string }>) {
      parts.push({ text: `[${m.role}] ${m.content}` });
    }
    
    const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const text = res.response.text().trim();
    return NextResponse.json({ message: text, agentType });
  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Fallback responses based on agent type and message count
    const messageCount = messages.filter(m => m.role === 'user').length;
    let fallbackMessage = '';
    
    if (agentType === 'styling') {
      if (messageCount === 0) {
        fallbackMessage = "What's your preferred font size - smaller (10pt) for more content, or larger (12pt) for readability? Also, do you want any text to be bold or italic for emphasis?";
      } else if (messageCount === 1) {
        fallbackMessage = "Do you prefer a traditional professional style or a more modern creative layout?";
      } else if (messageCount === 2) {
        fallbackMessage = "Any specific color preferences or section emphasis you'd like to highlight?";
      } else if (messageCount === 3) {
        fallbackMessage = "<STYLING_READY>";
      } else {
        fallbackMessage = "I've already asked all the styling questions. Please respond to the previous question.";
      }
    } else {
      if (messageCount === 0) {
        fallbackMessage = "How would you like your resume content formatted? Choose: 'concise' (shorter, focused bullets), 'balanced' (standard length), or 'detailed' (expanded with more context and achievements)?";
      } else if (messageCount === 1) {
        fallbackMessage = "For your projects and experiences, what are your most impressive quantified achievements? (e.g., 'Increased sales by 25%', 'Led team of 8 developers', 'Reduced costs by $50K'). If you don't want to enhance any, reply 'None'.";
      } else if (messageCount === 2) {
        fallbackMessage = "<CONTENT_READY>";
      } else {
        fallbackMessage = "I've already asked all the content questions. Please respond to the previous question.";
      }
    }
    
    return NextResponse.json({ message: fallbackMessage, agentType });
  }
}


