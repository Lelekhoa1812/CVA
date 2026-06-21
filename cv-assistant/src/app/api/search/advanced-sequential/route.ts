import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { loadUserContextSnapshot } from "@/lib/career/context";
import { buildSequentialQuestion } from "@/lib/search/server/intent";
import { buildSearchInstructionContext } from "@/lib/search/server/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.jobTitle || !body.location) {
    return NextResponse.json({ error: "Job title and location are required." }, { status: 400 });
  }

  const {
    jobTitle,
    location,
    filters = { postedWithin: "any", workplaceMode: "any", employmentType: "any" },
    selectedSources = [],
    searchInstruction = "",
    previousQuestions = [],
    previousAnswers = [],
  } = body;

  const snapshot = await loadUserContextSnapshot(auth.userId);
  const context = buildSearchInstructionContext({
    request: {
      jobTitle,
      location,
      filters,
      selectedSources,
      searchInstruction,
      maxResultsPerSource: 50,
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

  const result = await buildSequentialQuestion({
    request: {
      jobTitle,
      location,
      filters,
      selectedSources,
      searchInstruction,
    },
    context,
    previousQuestions,
    previousAnswers,
    experiences: snapshot.candidateFacts.filter((fact) => fact.kind === "experience"),
  });

  return NextResponse.json(result);
}
