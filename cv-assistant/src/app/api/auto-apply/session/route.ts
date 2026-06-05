import { NextRequest, NextResponse } from "next/server";
import { createAutoApplySessionSchema } from "@/lib/auto-apply/types";
import { createSessionWithSnapshot } from "@/lib/auto-apply/persistence";
import { isAuthPayload, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { connectToDatabase } from "@/lib/db";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  await connectToDatabase();
  const sessions = await AutoApplySessionModel.find({ userId: auth.userId })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  const parsed = createAutoApplySessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid Auto Apply session payload." },
      { status: 400 },
    );
  }

  const session = await createSessionWithSnapshot({
    userId: auth.userId,
    ...parsed.data,
  });

  return NextResponse.json({ session });
}
