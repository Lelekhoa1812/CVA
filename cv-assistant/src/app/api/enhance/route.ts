import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';
import { buildHighImpactRewritePrompt, normalizeHighImpactBulletOutput } from '@/lib/resume/high-impact-rewrite';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { type, name, description } = await req.json();
  if (!type || !name || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('hard');
    const prompt = buildHighImpactRewritePrompt({
      itemType: type,
      itemName: name,
      originalContent: description,
    });

    const res = await model.generateContent({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }] 
    });
    
    const enhancedDescription = normalizeHighImpactBulletOutput(
      res.response.text(),
      description,
    );
    
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
