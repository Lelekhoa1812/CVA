import { after, NextRequest, NextResponse } from "next/server";
import { claimRun, preparePending, startHeartbeat, runPipeline } from "@/lib/auto-apply/engine";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Starts the pipeline and returns immediately; the work continues after the response and the UI polls progress.
// mode "prepare" skips discovery and only prepares jobs already selected.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const prepareOnly = body.mode === "prepare";

  if (!(await claimRun(id, auth.userId))) {
    return NextResponse.json({ error: "A run is already in progress for this session." }, { status: 409 });
  }

  if (prepareOnly) {
    const selected = await AutoApplyJobCandidateModel.countDocuments({ sessionId: id, userId: auth.userId, status: "selected" });
    if (!selected) {
      await session.updateOne({ $set: { "run.phase": "idle", "run.message": "Select at least one role to prepare", "run.updatedAt": new Date(), status: "review" } });
      return NextResponse.json({ error: "Select at least one role first." }, { status: 400 });
    }
    after(async () => {
      const stopHeartbeat = startHeartbeat(id);
      try {
        await preparePending({ sessionId: id, userId: auth.userId });
      } finally {
        stopHeartbeat();
      }
    });
  } else {
    after(async () => {
      await runPipeline({ sessionId: id, userId: auth.userId });
    });
  }
  return NextResponse.json({ started: true }, { status: 202 });
}
