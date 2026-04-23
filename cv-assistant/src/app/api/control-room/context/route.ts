import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { loadUserContextSnapshot, updateUserContextSnapshot } from "@/lib/career/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await loadUserContextSnapshot(auth.userId);
  return NextResponse.json({ context });
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patch = await req.json().catch(() => null);
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Invalid context payload." }, { status: 400 });
  }

  const context = await updateUserContextSnapshot(auth.userId, patch);
  return NextResponse.json({ context });
}
