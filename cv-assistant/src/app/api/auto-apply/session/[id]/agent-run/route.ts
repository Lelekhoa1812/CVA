import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAgentEnabled } from "@/lib/auto-apply/agent";
import { agentApplySession, agentModeFor } from "@/lib/auto-apply/agent-run";
import { isAuthPayload, loadOwnedSession, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { autoApplyFiltersSchema } from "@/lib/auto-apply/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ force: z.boolean().optional() });

/** Starts the local agent on every approved application of the session, in the session's apply mode, and returns at once. */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  if (!isAgentEnabled()) return NextResponse.json({ error: "The local apply agent is not enabled on this server." }, { status: 404 });
  const { id } = await context.params;
  const session = await loadOwnedSession(auth.userId, id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  // "Check" is the floor: a session set to manual still lets the applicant ask the agent to fill and verify.
  const mode = agentModeFor(autoApplyFiltersSchema.parse(session.filters || {}).applyMode) || "check";
  const approved = await AutoApplyJobCandidateModel.countDocuments({ sessionId: id, userId: auth.userId, status: "approved" });
  if (!approved) return NextResponse.json({ error: "Approve at least one application first." }, { status: 409 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  after(() => agentApplySession({ sessionId: id, userId: auth.userId, mode, force: parsed.success ? parsed.data.force : false }));
  return NextResponse.json({ started: true, mode, approved }, { status: 202 });
}
