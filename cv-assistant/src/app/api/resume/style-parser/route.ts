import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userResponse } = await req.json();
  if (!userResponse || typeof userResponse !== 'string') {
    return NextResponse.json({ error: 'Invalid user response' }, { status: 400 });
  }

  const model = getModel('gemini-2.5-flash-lite');
  const prompt = `Parse this user response about resume styling preferences and return a JSON object with these exact keys:

{
  "fontSize": "10pt", "12pt" or "xxpt,
  "useBold": true or false,
  "useItalic": true or false,
  "boldSections": ["array of section names to make bold"],
  "italicSections": ["array of section names to make italic"],
  "contentDensity": "concise" or "balanced" or "detailed",
  "additionalNotes": "any other styling preferences mentioned"
}

User response: "${userResponse}"

Return only the JSON object, no other text.`;

  try {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const text = res.response.text().trim();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse style preferences' }, { status: 500 });
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ 
      fontSize: parsed.fontSize || '11pt',
      useBold: parsed.useBold || false,
      useItalic: parsed.useItalic || false,
      boldSections: parsed.boldSections || [],
      italicSections: parsed.italicSections || [],
      contentDensity: parsed.contentDensity || 'balanced',
      additionalNotes: parsed.additionalNotes || ''
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to parse style preferences' }, { status: 500 });
  }
}
