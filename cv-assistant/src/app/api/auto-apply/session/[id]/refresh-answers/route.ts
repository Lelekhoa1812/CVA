import { NextRequest, NextResponse } from "next/server";
import { refreshStandingAnswers } from "@/lib/auto-apply/engine";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const updated = await refreshStandingAnswers({ sessionId: id, userId: auth.userId });
  return NextResponse.json({ updated });
}
