import { NextRequest, NextResponse } from "next/server";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const events = await AutoApplyEventModel.find({ userId: auth.userId, sessionId: id })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(""), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
