import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel, Profile } from '@/lib/models/User';
import { getAuthFromCookies } from '@/lib/auth';
import { getModel } from '@/lib/ai';

type WithCreatedAt = { createdAt?: string | Date };

function ensureCreatedAt<T extends WithCreatedAt>(items?: T[]) {
  return (items || []).map((item) => ({
    ...item,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
  }));
}

function sortByCreatedAtDescending<T extends WithCreatedAt>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      (b.createdAt instanceof Date ? b.createdAt.valueOf() : new Date(b.createdAt || 0).valueOf()) -
      (a.createdAt instanceof Date ? a.createdAt.valueOf() : new Date(a.createdAt || 0).valueOf())
  );
}

function normalizeTimeline<T extends WithCreatedAt>(items?: T[]) {
  return sortByCreatedAtDescending(ensureCreatedAt(items));
}

function serializeProfile(profile: Profile | null | undefined) {
  if (!profile) return profile;
  return {
    ...profile,
    projects: sortByCreatedAtDescending(profile.projects || []),
    experiences: sortByCreatedAtDescending(profile.experiences || []),
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  return NextResponse.json({ profile: serializeProfile(user?.profile || null) });
}

export async function PUT(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  await connectToDatabase();

  // Generate summaries for new/updated items using the lightweight shared model preset.
  const model = getModel('easy');

  async function summarize(text: string) {
    const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: `Summarize in 1-2 concise sentences, return answer in text-only, no comments, not markdown:
${text}
` }] }] });
    return res.response.text().trim();
  }

  const profileInput = body || {};
  const normalizedProfile = {
    ...profileInput,
    projects: normalizeTimeline(profileInput.projects),
    experiences: normalizeTimeline(profileInput.experiences),
  };

  if (normalizedProfile.projects) {
    for (const p of normalizedProfile.projects) {
      if (!p.summary || p._needsSummary) {
        p.summary = await summarize(`${p.name}\n${p.description || ''}`);
      }
    }
  }
  if (normalizedProfile.experiences) {
    for (const ex of normalizedProfile.experiences) {
      if (!ex.summary || ex._needsSummary) {
        const timeframe = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`;
        ex.summary = await summarize(`${ex.companyName} - ${ex.role} (${timeframe})\n${ex.description || ''}`);
      }
    }
  }

  const updated = await UserModel.findByIdAndUpdate(auth.userId, { profile: normalizedProfile }, { new: true, upsert: false });
  const responseProfile = serializeProfile(updated?.profile || normalizedProfile);
  return NextResponse.json({ ok: true, profile: responseProfile });
}

