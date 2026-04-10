import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { runAICoaching, AICoachingValidationError, type ResumeProfile } from '@/lib/resume/ai-coaching';
import { MAX_RESUME_ITEMS } from '@/lib/resume/constants';

// Root Cause vs Logic:
// Root Cause: The resume generation payload validation only allowed styles 1-4, so style5 requests failed with "Invalid resume generation payload."
// Logic: Include style5 in the enum so ledger-style resumes pass schema validation and reach the specialized PDF route.
const requestSchema = z.object({
  selectedStyle: z.enum(['style1', 'style2', 'style3', 'style4', 'style5']),
  skills: z.string().optional().default(''),
  selectedProjects: z.array(z.number()).default([]),
  selectedExperiences: z.array(z.number()).default([]),
  enhance: z.boolean().optional().default(false),
  qa: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional().default([]),
  stylePreferences: z.any().optional(),
  contentEnhancementData: z.record(z.string(), z.string()).optional().default({}),
  ai_coaching_enabled: z.boolean().optional().default(false),
  job_description: z.string().optional().default(''),
});

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid resume generation payload.' }, { status: 400 });
  }

  if (
    !body.ai_coaching_enabled &&
    body.selectedProjects.length + body.selectedExperiences.length > MAX_RESUME_ITEMS
  ) {
    return NextResponse.json(
      { error: `You can include at most ${MAX_RESUME_ITEMS} items across projects and experiences.` },
      { status: 400 },
    );
  }

  let selectedProjects = body.selectedProjects;
  let selectedExperiences = body.selectedExperiences;
  let contentEnhancementData = body.contentEnhancementData;
  let enhance = body.enhance;

  if (body.ai_coaching_enabled) {
    await connectToDatabase();
    const user = await UserModel.findById(auth.userId).lean();
    const profile = (user?.profile || {}) as ResumeProfile;

    try {
      const coachingResult = await runAICoaching({
        jobDescription: body.job_description,
        profile,
      });

      selectedProjects = coachingResult.selectedProjects;
      selectedExperiences = coachingResult.selectedExperiences;
      contentEnhancementData = {
        ...body.contentEnhancementData,
        ...coachingResult.contentEnhancementData,
      };
      enhance = false;
    } catch (error) {
      if (error instanceof AICoachingValidationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }

      console.error('AI Coaching failed:', error);
      return NextResponse.json(
        { error: 'AI Coaching could not analyze this job description right now. Please try again.' },
        { status: 500 },
      );
    }
  }

  const upstream = await fetch(`${req.nextUrl.origin}/api/resume/${body.selectedStyle}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
    },
    body: JSON.stringify({
      skills: body.skills,
      selectedProjects,
      selectedExperiences,
      enhance,
      qa: body.qa,
      stylePreferences: body.stylePreferences,
      contentEnhancementData,
    }),
  });

  if (!upstream.ok) {
    const errorBody = await upstream.text();
    return new NextResponse(errorBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  }

  const pdfBuffer = await upstream.arrayBuffer();
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/pdf',
      'Content-Disposition': upstream.headers.get('Content-Disposition') || 'inline; filename="resume.pdf"',
    },
  });
}
