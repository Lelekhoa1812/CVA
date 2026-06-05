import { NextResponse, type NextRequest } from "next/server";
import { getAuthFromCookies, type AuthTokenPayload } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";

export function requireAutoApplyAuth(req: NextRequest): AuthTokenPayload | NextResponse {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return auth;
}

export async function loadOwnedSession(userId: string, sessionId: string) {
  await connectToDatabase();
  return AutoApplySessionModel.findOne({ _id: sessionId, userId });
}

export async function loadOwnedJob(userId: string, jobId: string) {
  await connectToDatabase();
  return AutoApplyJobCandidateModel.findOne({ _id: jobId, userId });
}

export async function loadOwnedDraft(userId: string, applicationId: string) {
  await connectToDatabase();
  return AutoApplyApplicationDraftModel.findOne({ _id: applicationId, userId });
}

export function isAuthPayload(value: AuthTokenPayload | NextResponse): value is AuthTokenPayload {
  return !(value instanceof NextResponse);
}
