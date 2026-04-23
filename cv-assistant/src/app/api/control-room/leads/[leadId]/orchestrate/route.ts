import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { orchestrateLead } from "@/lib/career/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leadId } = await context.params;

  try {
    const detail = await orchestrateLead(auth.userId, leadId);
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to orchestrate lead." },
      { status: 500 },
    );
  }
}
