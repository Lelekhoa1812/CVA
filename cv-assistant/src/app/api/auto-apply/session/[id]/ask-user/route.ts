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

  const body = await req.json().catch(() => ({}));
  await session.updateOne({ $set: { status: "awaiting_user_answer" } });
  const event = await logAutoApplyEvent({
    userId: auth.userId,
    sessionId: id,
    type: "user_question",
    message: body.question || "The agent needs user input.",
    payload: {
      reason: body.reason || "",
      suggestedAnswer: body.suggestedAnswer || "",
      saveOptions: body.saveOptions || {},
    },
  });
  return NextResponse.json({ event });
}
