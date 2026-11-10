// Runs the local apply agent for approved applications and records what it did. The agent only touches an application the
// applicant approved, only submits when the session's apply mode says so, never retries an application it could not confirm,
// and keeps to a daily limit and a human pace.
import os from "node:os";
import path from "node:path";
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyEventModel } from "@/lib/models/AutoApplyEvent";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { UserModel, type Profile } from "@/lib/models/User";
import { isAgentEnabled, runApplyAgent, type AgentMode, type AgentResult } from "./agent";
import { logAutoApplyEvent } from "./persistence";
import { buildAutofillPack } from "./pack";
import type { DraftAnswer } from "./questions";
import { autoApplyFiltersSchema } from "./types";

export const AGENT_DAILY_CAP = Math.max(1, Number(process.env.AUTO_APPLY_AGENT_DAILY_CAP) || 25);
const RUNNING_STALE_MS = 10 * 60_000;
const PAUSE_MS: [number, number] = [4_000, 9_000];

declare global {
  var autoApplyAgentActive: Set<string> | undefined;
}
const active = globalThis.autoApplyAgentActive ?? new Set<string>();
globalThis.autoApplyAgentActive = active;

export function agentWorkDir(jobId: string) {
  return path.join(os.tmpdir(), "cva-agent", jobId);
}

export type AgentRunOutcome = AgentResult | { status: "skipped"; reason: string };

/** Whether a session's apply mode lets the agent act at all, and how far. */
export function agentModeFor(applyMode: string): AgentMode | null {
  if (applyMode === "agent_submit") return "submit";
  if (applyMode === "agent_check") return "check";
  return null;
}

/** An application the agent already tried is not tried again on its own: a retry could send a duplicate or hit the same wall. */
export function agentShouldSkip(agent: { status?: string; running?: boolean; at?: Date | null } | null | undefined, force: boolean, now = Date.now()): string | null {
  if (!agent?.status && !agent?.running) return null;
  if (agent.running && agent.at && now - new Date(agent.at).getTime() < RUNNING_STALE_MS) return "The agent is already working on this application.";
  // Even a forced run never sends the same application twice.
  if (agent.status === "submitted") return "The agent already submitted this application.";
  if (force) return null;
  if (agent.status === "uncertain") return "The agent pressed Submit but never saw a confirmation. Check your email or the employer's site first.";
  if (agent.status === "failed") return "The employer's form rejected this application last time.";
  if (agent.status === "blocked") return "The agent was stopped by this form last time. Fix what it reported, or open the form yourself.";
  return null;
}

export async function agentApplyJob(args: { jobId: string; userId: string; mode: AgentMode; force?: boolean; signal?: AbortSignal }): Promise<AgentRunOutcome> {
  await connectToDatabase();
  const job = await AutoApplyJobCandidateModel.findOne({ _id: args.jobId, userId: args.userId });
  if (!job) return { status: "skipped", reason: "Application not found." };
  if (job.status !== "approved") return { status: "skipped", reason: "Approve this application first." };
  const session = await AutoApplySessionModel.findOne({ _id: job.sessionId, userId: args.userId }).lean();
  const filters = autoApplyFiltersSchema.parse(session?.filters || {});
  // Submitting needs the applicant's explicit choice for the session; without it the agent only fills and checks.
  const mode: AgentMode = args.mode === "submit" && filters.applyMode === "agent_submit" ? "submit" : "check";

  const skip = agentShouldSkip(job.agent as { status?: string; running?: boolean; at?: Date | null } | undefined, Boolean(args.force));
  if (skip) return { status: "skipped", reason: skip };
  if (mode === "submit") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await AutoApplyEventModel.countDocuments({ userId: args.userId, type: "applied_by_agent", createdAt: { $gte: startOfDay } });
    if (today >= AGENT_DAILY_CAP) return { status: "skipped", reason: `Daily limit of ${AGENT_DAILY_CAP} agent submissions reached. It resets tomorrow.` };
  }
  const draft = await AutoApplyApplicationDraftModel.findOne({ jobCandidateId: job._id, userId: args.userId });
  if (!draft) return { status: "skipped", reason: "No prepared application." };

  const claimed = await AutoApplyJobCandidateModel.findOneAndUpdate(
    { _id: job._id, userId: args.userId, status: "approved", $or: [{ "agent.running": { $ne: true } }, { "agent.at": { $lt: new Date(Date.now() - RUNNING_STALE_MS) } }] },
    { $set: { "agent.running": true, "agent.mode": mode, "agent.at": new Date() } },
    { new: true },
  );
  if (!claimed) return { status: "skipped", reason: "The agent is already working on this application." };

  const user = await UserModel.findById(args.userId).lean();
  const pack = buildAutofillPack({
    title: job.title,
    company: job.company,
    applyUrl: draft.applyUrl || job.applyUrl,
    provider: job.ats?.provider || "",
    answers: (draft.answers || []) as unknown as DraftAnswer[],
    coverLetter: draft.coverLetterText,
  });
  let result: AgentResult;
  try {
    result = await runApplyAgent({ pack, profile: (user?.profile || {}) as Partial<Profile>, mode, workDir: agentWorkDir(job._id.toString()), signal: args.signal });
  } catch (error) {
    result = { status: "failed", reason: `The agent could not run: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`, filled: 0, total: 0, missing: [], url: pack.job.applyUrl };
  }

  const jobId = job._id.toString();
  const sessionId = job.sessionId.toString();
  const record = { status: result.status, mode, reason: result.reason, filled: result.filled, total: result.total, missing: result.missing, confirmation: result.confirmation || "", screenshot: result.screenshot || "", at: new Date(), running: false };
  if (result.status === "submitted") {
    await AutoApplyJobCandidateModel.updateOne(
      { _id: job._id },
      { $set: { status: "applied", appliedAt: new Date(), lastError: "", agent: record }, $push: { stageHistory: { stage: "applied", at: new Date(), note: `Submitted by the local agent: the employer's page said "${result.confirmation}"` } } },
    );
    await draft.updateOne({ $set: { finalReviewStatus: "applied", submittedAt: new Date() } });
    await logAutoApplyEvent({ userId: args.userId, sessionId, jobCandidateId: jobId, type: "applied_by_agent", message: `Submitted by the agent: ${job.title} at ${job.company}. The employer's page confirmed it.` });
  } else {
    await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { agent: record, lastError: result.status === "ready" ? "" : result.reason } });
    const text = {
      ready: `Checked by the agent: ${job.title} at ${job.company} is filled and complete (${result.filled} of ${result.total} fields). Nothing was sent.`,
      blocked: `The agent stopped on ${job.title} at ${job.company}: ${result.reason}`,
      failed: `The agent could not finish ${job.title} at ${job.company}: ${result.reason}`,
      uncertain: `${job.title} at ${job.company}: ${result.reason}`,
    }[result.status];
    await logAutoApplyEvent({ userId: args.userId, sessionId, jobCandidateId: jobId, type: `agent_${result.status}`, message: text });
  }
  return result;
}

async function isStopped(sessionId: string) {
  const session = await AutoApplySessionModel.findById(sessionId).select("run status").lean();
  return Boolean(session && (session.run?.phase === "cancelled" || session.status === "stopped"));
}

const pause = (signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]));
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });

/** Works through the session's approved applications one at a time, at a human pace. */
export async function agentApplySession(args: { sessionId: string; userId: string; mode: AgentMode; force?: boolean; signal?: AbortSignal }) {
  if (!isAgentEnabled() || active.has(args.sessionId)) return { ran: 0, submitted: 0, stopped: 0 };
  active.add(args.sessionId);
  const counts = { ran: 0, submitted: 0, stopped: 0 };
  try {
    await connectToDatabase();
    const jobs = await AutoApplyJobCandidateModel.find({ sessionId: args.sessionId, userId: args.userId, status: "approved" }).sort({ fitScore: -1 }).select("_id").lean();
    if (!jobs.length) return counts;
    await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "agent_started", message: `The agent is ${args.mode === "submit" ? "applying to" : "checking"} ${jobs.length} approved application${jobs.length === 1 ? "" : "s"}.` });
    for (const [index, job] of jobs.entries()) {
      if (args.signal?.aborted || (await isStopped(args.sessionId))) break;
      const outcome = await agentApplyJob({ jobId: job._id.toString(), userId: args.userId, mode: args.mode, force: args.force, signal: args.signal });
      if (outcome.status === "skipped") continue;
      counts.ran += 1;
      if (outcome.status === "submitted") counts.submitted += 1;
      else if (outcome.status !== "ready") counts.stopped += 1;
      if (index < jobs.length - 1) await pause(args.signal);
    }
    await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "agent_finished", message: args.mode === "submit" ? `The agent finished: ${counts.submitted} submitted, ${counts.stopped} handed back to you.` : `The agent finished checking: ${counts.ran - counts.stopped} ready, ${counts.stopped} handed back to you.` });
  } finally {
    active.delete(args.sessionId);
  }
  return counts;
}

/** Starts the agent for a session when its apply mode asks for it. Safe to call after every approval: it does nothing otherwise. */
export async function kickAgent(args: { sessionId: string; userId: string }) {
  try {
    if (!isAgentEnabled()) return;
    await connectToDatabase();
    const session = await AutoApplySessionModel.findOne({ _id: args.sessionId, userId: args.userId }).lean();
    const mode = agentModeFor(autoApplyFiltersSchema.parse(session?.filters || {}).applyMode);
    if (mode) await agentApplySession({ ...args, mode });
  } catch (error) {
    console.warn("auto-apply agent could not start", error instanceof Error ? error.message : error);
  }
}
