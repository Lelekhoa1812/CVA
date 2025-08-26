import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemType, itemName, originalContent, userPreferences } = await req.json();
  
  if (!itemType || !itemName || !originalContent || !userPreferences) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const model = getModel('gemini-2.5-flash');
    
    // Create a targeted enhancement prompt
    const prompt = `You are a professional resume writer. Enhance the following ${itemType} content based on the user's preferences:

ITEM: ${itemName}
ORIGINAL CONTENT: ${originalContent}

USER PREFERENCES:
- Format: ${userPreferences.format} (concise = shorter/focused, preserve = keep current length, enhance = expand with more context)
- Modifications: ${userPreferences.modifications}

INSTRUCTIONS:
1. If format is "concise": Reduce content by ~50% while keeping key achievements and impact
2. If format is "preserve": Keep similar length but improve clarity and impact
3. If format is "enhance": Expand content by ~50% with more context, metrics, and achievements
4. Apply the specific modifications requested by the user
5. Use bullet points for better readability
6. Make it ATS-friendly and professional
7. Focus on quantifiable achievements when possible
8. Use **bold** for key achievements, metrics, and important terms
9. Use *italic* for emphasis on skills, technologies, and methodologies
10. Return only the enhanced content, no explanations

Enhanced content:`;

    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const enhancedContent = res.response.text().trim();
    
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
