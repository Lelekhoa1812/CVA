import { NextRequest, NextResponse } from "next/server";
import { saveAutoApplyMemory } from "@/lib/auto-apply/persistence";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { saveAnswerSchema } from "@/lib/auto-apply/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const parsed = saveAnswerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid answer." }, { status: 400 });
  }

  try {
    const memory = await saveAutoApplyMemory({ userId: auth.userId, sessionId: id, ...parsed.data });
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save answer." },
      { status: 400 },
    );
  }
}
