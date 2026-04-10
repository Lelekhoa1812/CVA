import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { parseProfileImportFromFile, parseProfileImportFromText } from '@/lib/profile-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const contentType = req.headers.get('content-type') || '';

    /* Motivation vs Logic:
       Motivation: profile import now needs to support PDF, DOCX, and pasted free-form text without drifting into
       separate parser behavior that returns incompatible shapes.
       Logic: route both multipart file uploads and JSON text payloads through the shared profile-import helpers so
       every import source returns one normalized candidate profile object. */
    if (contentType.includes('application/json')) {
      const body = (await req.json()) as { text?: string };
      if (!body.text?.trim()) {
        return NextResponse.json({ error: 'No text provided' }, { status: 400 });
      }

      const data = await parseProfileImportFromText(body.text);
      return NextResponse.json({ data });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    const data = await parseProfileImportFromFile(file);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse import' },
      { status: 500 },
    );
  }
}
