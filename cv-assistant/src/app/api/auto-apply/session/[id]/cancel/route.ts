import { NextRequest, NextResponse } from "next/server";
import { logAutoApplyEvent } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  await session.updateOne({ $set: { "run.phase": "cancelled", "run.message": "Stopping", "run.updatedAt": new Date() } });
  await logAutoApplyEvent({ userId: auth.userId, sessionId: id, type: "run_cancel_requested", message: "Stop requested." });
  return NextResponse.json({ cancelled: true });
}
