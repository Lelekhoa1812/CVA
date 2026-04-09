import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { generateJsonSafe } from '@/lib/ai';
import { buildExperienceRankingPrompt, getCoverLetterItems } from '@/lib/cover-letter';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { jobDescription } = await req.json();
  if (!jobDescription) return NextResponse.json({ error: 'Missing jobDescription' }, { status: 400 });
  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile;
  const items = getCoverLetterItems(profile);
  if (!items.length) {
    return NextResponse.json({ indices: [], items: [], rankings: [] });
  }

  let rankings: Array<{
    index: number;
    type: 'project' | 'experience';
    title: string;
    summary: string;
    justification: string;
  }> = [];

  try {
    const parsed = await generateJsonSafe('hard', buildExperienceRankingPrompt(jobDescription, items), 1);
    const candidateRankings: Array<{ index?: number; justification?: string }> = Array.isArray(parsed?.rankings)
      ? parsed.rankings
      : [];
    const seen = new Set<number>();

    rankings = candidateRankings
      .map((entry) => {
        const index = typeof entry?.index === 'number' ? entry.index : Number.NaN;
        const item = items[index];
        if (!Number.isInteger(index) || !item || seen.has(index)) return null;
        seen.add(index);

        return {
          index,
          type: item.type,
          title: item.title,
          summary: item.summary,
          justification:
            typeof entry?.justification === 'string' && entry.justification.trim()
              ? entry.justification.trim()
              : `${item.title} aligns with the role based on the candidate data provided.`,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          index: number;
          type: 'project' | 'experience';
          title: string;
          summary: string;
          justification: string;
        } => Boolean(entry),
      )
      .slice(0, 6);
  } catch {
    rankings = [];
  }

  if (!rankings.length) {
    rankings = items.slice(0, 6).map((item) => ({
      index: item.index,
      type: item.type,
      title: item.title,
      summary: item.summary,
      justification: 'Fallback ranking applied because AI coaching could not confidently reorder this evidence.',
    }));
  }

  return NextResponse.json({
    indices: rankings.map((item) => item.index),
    items,
    rankings,
  });
}
