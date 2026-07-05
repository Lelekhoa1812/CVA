import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { MAX_RESUME_ITEMS } from '@/lib/resume/constants';
import { renderResumePdf, type ResumePdfProfile, type ResumeRenderRequest } from '@/lib/resume/pdf-renderer';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<ResumeRenderRequest> | null;
  const selectedProjects = Array.isArray(body?.selectedProjects) ? body.selectedProjects.filter(Number.isInteger) : [];
  const selectedExperiences = Array.isArray(body?.selectedExperiences) ? body.selectedExperiences.filter(Number.isInteger) : [];

  if (selectedProjects.length + selectedExperiences.length === 0) {
    return NextResponse.json({ error: 'Please select at least one project or experience' }, { status: 400 });
  }

  if (selectedProjects.length + selectedExperiences.length > MAX_RESUME_ITEMS) {
    return NextResponse.json({ error: 'Too many items selected' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = (user?.profile || {}) as ResumePdfProfile;

  const result = await renderResumePdf({
    template: 'style2',
    profile,
    request: {
      ...body,
      selectedProjects,
      selectedExperiences,
      skills: typeof body?.skills === 'string' ? body.skills : '',
      contentEnhancementData: body?.contentEnhancementData || {},
    },
  });

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"',
      'X-CV-Assistant-Resume-Pages': String(result.telemetry.pageCount),
      'X-CV-Assistant-Resume-ATS-Score': String(result.telemetry.atsScore),
      'X-CV-Assistant-Resume-Density': result.telemetry.density,
      'X-CV-Assistant-Resume-Selected-Experiences': String(result.telemetry.selectedExperiences),
      'X-CV-Assistant-Resume-Selected-Projects': String(result.telemetry.selectedProjects),
      'X-CV-Assistant-Resume-Times-Style': result.telemetry.usingTimes ? 'true' : 'fallback-unicode',
      'X-CV-Assistant-Resume-Truncated': result.telemetry.truncatedToTwoPages ? 'true' : 'false',
    },
  });
}
