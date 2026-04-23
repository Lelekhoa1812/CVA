import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { getControlRoomOverview } from "@/lib/career/control-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overview = await getControlRoomOverview(auth.userId);
  return NextResponse.json(overview);
}
