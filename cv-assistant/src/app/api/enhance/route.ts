import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { type, name, description } = await req.json();
  if (!type || !name || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('gemini-2.5-flash-lite');
    
    const prompt = `Enhance and tailor the following ${type} description to be more professional, impactful, and suitable for a resume/CV. 

${type === 'project' ? 'Project' : 'Experience'}: ${name}

Current Description:
${description}

Instructions:
- Make it more professional and impactful
- Use action verbs and quantifiable results when possible
- Focus on achievements and outcomes
- Keep it concise but comprehensive
- Maintain the core information while improving clarity and impact
- Use bullet points or structured format if appropriate
- Make it suitable for professional applications

Return only the enhanced description, no other text.

Enhanced Description:`;

    const res = await model.generateContent({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }] 
    });
    
    const enhancedDescription = res.response.text().trim();
    
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
