import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';
import { buildHighImpactRewritePrompt, normalizeHighImpactBulletOutput } from '@/lib/resume/high-impact-rewrite';
import {
  buildTextSectionPrompt,
  hasTextSectionExploreEvidence,
  normalizeTextSectionOutput,
  type TextSectionExploreContext,
} from '@/lib/resume/text-section-prompts';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const {
    type,
    name,
    description,
    mode,
    context,
  }: {
    type?: string;
    name?: string;
    description?: string;
    mode?: 'enhance' | 'explore';
    context?: TextSectionExploreContext;
  } = await req.json();

  if (!type || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('hard');
    if (type === 'skills' || type === 'profile') {
      const textSectionMode = mode === 'explore' ? 'explore' : 'enhance';

      if (textSectionMode === 'explore' && !hasTextSectionExploreEvidence(context)) {
        return NextResponse.json({ error: 'Missing education, project, or experience context' }, { status: 400 });
      }

      if (textSectionMode === 'enhance' && !description) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const prompt = buildTextSectionPrompt({
        type,
        content: description,
        mode: textSectionMode,
        context,
      });
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const enhancedDescription = normalizeTextSectionOutput(
        res.response.text(),
        description?.trim() || '',
      );

      return NextResponse.json({
        enhancedDescription,
        message: `${type} content ${textSectionMode === 'explore' ? 'generated' : 'enhanced'} successfully`
      });
    }

    if (!description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
