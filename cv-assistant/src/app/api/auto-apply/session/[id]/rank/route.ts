import { NextRequest, NextResponse } from "next/server";
import { upsertRankedCandidates } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { autoApplyFiltersSchema } from "@/lib/auto-apply/types";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const existing = await AutoApplyJobCandidateModel.find({ userId: auth.userId, sessionId: id }).lean();
  const filters = autoApplyFiltersSchema.parse(session.filters || {});
  const jobs = await upsertRankedCandidates({
    userId: auth.userId,
    sessionId: id,
    prompt: session.prompt,
    filters,
    jobs: existing.map((job) => ({
      id: job._id.toString(),
      source: job.source,
      title: job.title,
      company: job.company,
      location: job.location,
      descriptionText: job.descriptionText,
      listingUrl: job.url,
      applicationUrl: job.applyUrl,
      applicationUrlType: job.applyUrlType,
      dedupeKey: job.dedupeKey,
    })),
  });

  await session.updateOne({ $set: { status: session.mode === "manual_curate" ? "awaiting_selection" : "ranking" } });
  return NextResponse.json({ jobs });
}
