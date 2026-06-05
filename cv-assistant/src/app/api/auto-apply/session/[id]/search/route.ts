import { NextRequest, NextResponse } from "next/server";
import { logAutoApplyEvent, upsertRankedCandidates } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { autoApplyFiltersSchema, toSearchRequest } from "@/lib/auto-apply/types";
import { fromSearchResult } from "@/lib/auto-apply/ranking";
import { streamSearchJobs } from "@/lib/search/server/stream";
import type { JobSearchResult } from "@/lib/search/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const filters = autoApplyFiltersSchema.parse(session.filters || {});
  const searchRequest = toSearchRequest(session.prompt, filters);
  await session.updateOne({ $set: { status: "searching" } });
  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: id,
    type: "search_started",
    message: "Searching jobs using your prompt.",
    payload: { searchRequest },
  });

  const results: JobSearchResult[] = [];
  const blockedSources = new Set<string>();
  for await (const event of streamSearchJobs(searchRequest, { signal: req.signal })) {
    if (event.type === "result") results.push(event.result);
    if (event.type === "source-progress" && event.status === "blocked") blockedSources.add(event.source);
    if (event.type === "complete") event.blockedSources.forEach((source) => blockedSources.add(source));
  }

  const jobs = await upsertRankedCandidates({
    userId: auth.userId,
    sessionId: id,
    jobs: results.map(fromSearchResult),
    prompt: session.prompt,
    filters: {
      mustHaveKeywords: filters.mustHaveKeywords,
      excludeKeywords: filters.excludeKeywords,
      companyBlacklist: filters.companyBlacklist,
    },
  });

  await session.updateOne({
    $set: {
      status: session.mode === "manual_curate" ? "awaiting_selection" : "ranking",
    },
  });
  await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: id,
    type: "search_completed",
    message: `Found ${results.length} jobs and attached ${jobs.length} ranked candidates.`,
    payload: { found: results.length, ranked: jobs.length, blockedSources: [...blockedSources] },
  });

  return NextResponse.json({ jobs, found: results.length, blockedSources: [...blockedSources] });
}
