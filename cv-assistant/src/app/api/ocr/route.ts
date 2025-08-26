import { NextRequest, NextResponse } from 'next/server';
// Use Next.js formData API for simplicity
import { getAuthFromCookies } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }
  const fileArrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(fileArrayBuffer);

  const apiKey = process.env.GEMINI_API as string;
  if (!apiKey) return NextResponse.json({ error: 'Missing GEMINI_API' }, { status: 500 });
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Detect and validate MIME type: allow PDF, PNG, and JPG/JPEG
  const uploadedType = (file.type || '').toLowerCase();
  let mimeType: string;
  if (uploadedType === 'application/pdf') {
    mimeType = 'application/pdf';
  } else if (uploadedType === 'image/png') {
    mimeType = 'image/png';
  } else if (uploadedType === 'image/jpeg' || uploadedType === 'image/jpg') {
    mimeType = 'image/jpeg';
  } else {
    // Fallback: detect by filename extension if type missing
    const name = (file as unknown as { name?: string }).name || '';
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (lower.endsWith('.png')) mimeType = 'image/png';
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a PDF, PNG, or JPG/JPEG image.' }, { status: 400 });
    }
  }

  const filePart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType,
    },
  } as { inlineData: { data: string; mimeType: string } };

  const prompt = `You are an OCR parser for resumes. Extract projects and experiences into the following strict JSON schema:
{
  "projects": [{"name": string, "description": string}],
  "experiences": [{"companyName": string, "role": string, "timeFrom": string, "timeTo": string, "description": string}]
}
Return ONLY JSON with no markdown fences. If uncertain, best-effort.`;

  let parsed: { projects?: Array<{ name?: string; description?: string }>; experiences?: Array<{ companyName?: string; role?: string; timeFrom?: string; timeTo?: string; description?: string }> } | null = null;
  let lastError: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          filePart,
        ]}],
      });
      const text = res.response.text();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const jsonStr = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
      parsed = JSON.parse(jsonStr);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!parsed) return NextResponse.json({ error: 'Failed to parse JSON', detail: String(lastError) }, { status: 500 });

  return NextResponse.json({ data: parsed });
}


