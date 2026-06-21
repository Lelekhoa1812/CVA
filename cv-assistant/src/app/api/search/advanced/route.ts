import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { loadUserContextSnapshot } from "@/lib/career/context";
import { buildAdvancedSearchQuestionPlan } from "@/lib/search/server/intent";
import { buildSearchInstructionContext } from "@/lib/search/server/utils";
import { searchRequestSchema } from "@/lib/search/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = searchRequestSchema.partial({
    maxResultsPerSource: true,
    advancedSearchSession: true,
    instructionExpansion: true,
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.jobTitle || !parsed.data.location) {
    return NextResponse.json({ error: "Job title and location are required." }, { status: 400 });
  }

  const snapshot = await loadUserContextSnapshot(auth.userId);
  const context = buildSearchInstructionContext({
    request: {
      ...parsed.data,
      filters: parsed.data.filters || { postedWithin: "any", workplaceMode: "any", employmentType: "any" },
      maxResultsPerSource: parsed.data.maxResultsPerSource || 50,
      selectedSources: parsed.data.selectedSources || [],
    },
    context: {
      targetRoles: snapshot.targetRoles,
      preferredLocations: snapshot.workPreferences.preferredLocations,
      preferredSources: snapshot.searchPreferences.sources,
      remoteOnly: snapshot.workPreferences.remoteOnly || snapshot.searchPreferences.remoteOnly,
      techStackPreferences: snapshot.techStackPreferences,
      cultureSignals: snapshot.cultureSignals.map((signal) => signal.label),
    },
  });

  const plan = await buildAdvancedSearchQuestionPlan({
    request: {
      jobTitle: parsed.data.jobTitle,
      location: parsed.data.location,
      filters: parsed.data.filters || { postedWithin: "any", workplaceMode: "any", employmentType: "any" },
      selectedSources: parsed.data.selectedSources || [],
      searchInstruction: parsed.data.searchInstruction || "",
    },
    context,
  });

  return NextResponse.json(plan);
}
