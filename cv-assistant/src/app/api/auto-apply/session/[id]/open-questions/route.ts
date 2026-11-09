import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerOpenQuestion, loadOpenQuestions } from "@/lib/auto-apply/inbox";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The questions applications are waiting on, grouped so each is answered once for every application. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  if (!(await loadOwnedSession(auth.userId, id))) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ groups: await loadOpenQuestions({ sessionId: id, userId: auth.userId }) });
}

const answerSchema = z.object({ key: z.string().min(1).max(300), value: z.string().trim().min(1, "Give an answer first.").max(4000), remember: z.boolean().default(false) });

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  if (!(await loadOwnedSession(auth.userId, id))) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const parsed = answerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid answer." }, { status: 400 });
  const result = await answerOpenQuestion({ sessionId: id, userId: auth.userId, ...parsed.data });
  return NextResponse.json(result);
}
