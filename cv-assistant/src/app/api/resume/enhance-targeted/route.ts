import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';
import { buildHighImpactRewritePrompt, normalizeHighImpactBulletOutput } from '@/lib/resume/high-impact-rewrite';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemType, itemName, originalContent, userPreferences } = await req.json();
  
  if (!itemType || !itemName || !originalContent || !userPreferences) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('hard');
    const prompt = buildHighImpactRewritePrompt({
      itemType,
      itemName,
      originalContent,
      requestedFormat: userPreferences.format,
      userModifications: userPreferences.modifications,
    });

    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const enhancedContent = normalizeHighImpactBulletOutput(
      res.response.text(),
      originalContent,
      userPreferences.format,
    );
    
    return NextResponse.json({ 
      enhancedContent,
      itemType,
      itemName,
      originalLength: originalContent.length,
      enhancedLength: enhancedContent.length
    });
    
  } catch (error) {
    console.error('Targeted enhancement failed:', error);
    return NextResponse.json({ 
      error: 'Failed to enhance content',
      fallback: originalContent // Return original content as fallback
    }, { status: 500 });
  }
}
