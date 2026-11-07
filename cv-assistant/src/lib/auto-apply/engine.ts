// Auto Apply pipeline: discover -> resolve -> score -> select -> prepare. Designed for serverless: every stage
// persists incrementally, uses bounded concurrency and deadlines, and can be resumed by running it again.
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { AutoApplyApplicationDraftModel } from "@/lib/models/AutoApplyApplicationDraft";
import { AutoApplyJobCandidateModel } from "@/lib/models/AutoApplyJobCandidate";
import { AutoApplyMemoryModel } from "@/lib/models/AutoApplyMemory";
import { AutoApplySessionModel } from "@/lib/models/AutoApplySession";
import { UserModel, type Profile } from "@/lib/models/User";
import { streamSearchJobs } from "@/lib/search/server/stream";
import type { JobSearchResult } from "@/lib/search/types";
import { buildCandidateSummary, candidateContact, hasUsableProfile, mergePreferences } from "./candidate";
import { detectAts, safeHttpUrl, isJobBoardUrl } from "./ats";
import { buildRoleMatcher, discoverFromDirectory, mapWithConcurrency, matchesLocation, matchesRole, resolveJob, type ResolvedJob } from "./discovery";
import { scoreJobsWithLlm } from "./fit";
import { hashApplicationPayload, prepareApplication } from "./prepare";
import { logAutoApplyEvent } from "./persistence";
import { answerDeterministically, countMissing, type ApplicantPreferences, type DraftAnswer, type FormQuestion, type MemoryEntry } from "./questions";
import { fromSearchResult, rankAutoApplyCandidates, type RankableJob } from "./ranking";
import { PREPARE_LOCK_MS, RUN_STALL_MS, normalizeStage } from "./state";
import { autoApplyFiltersSchema, toSearchRequest } from "./types";

export const RUN_BUDGET_MS = 270_000;
const SCORE_TOP_N = 28;
const SELECT_MIN_SCORE = 62;
const BOARD_CRAWL_MS = 70_000;

class PipelineAbort extends Error {}

export async function loadUserContext(userId: string) {
  await connectToDatabase();
  const user = await UserModel.findById(userId).lean();
  const profile = (user?.profile || null) as Partial<Profile> | null;
  const storedPreferences = (user?.autoApplyPreferences || {}) as Partial<ApplicantPreferences>;
  const memories = await AutoApplyMemoryModel.find({ userId, scope: "reusable_profile" }).lean();
  const memory: MemoryEntry[] = memories.map((entry) => ({ questionPattern: entry.questionPattern, answer: entry.answer }));
  return { profile, storedPreferences, memory };
}

async function setRun(sessionId: string, phase: string, message: string, stats?: Record<string, number>, status?: string) {
  const set: Record<string, unknown> = {
    "run.phase": phase,
    "run.message": message,
    "run.updatedAt": new Date(),
  };
  if (stats) set["run.stats"] = stats;
  if (status) set.status = status;
  await AutoApplySessionModel.updateOne({ _id: sessionId }, { $set: set });
}

export async function isCancelled(sessionId: string) {
  const session = await AutoApplySessionModel.findById(sessionId).select("run status").lean();
  return Boolean(session && (session.run?.phase === "cancelled" || session.status === "stopped"));
}

/**
 * Keeps run.updatedAt fresh while a pipeline is alive. If the serverless function is cut off the heartbeat stops,
 * and the session is recognised as stalled instead of showing "preparing" forever.
 */
export function startHeartbeat(sessionId: string) {
  const timer = setInterval(() => {
    void AutoApplySessionModel.updateOne({ _id: sessionId, "run.phase": { $in: ["searching", "scoring", "preparing"] } }, { $set: { "run.updatedAt": new Date() } }).catch((error: unknown) => console.warn("auto-apply heartbeat failed", error instanceof Error ? error.message : error));
  }, 20_000);
  return () => clearInterval(timer);
}

/** Claim the run lock. Returns false when another run is active (and not stale). */
export async function claimRun(sessionId: string, userId: string) {
  const staleBefore = new Date(Date.now() - RUN_STALL_MS);
  const claimed = await AutoApplySessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      userId,
      $or: [
        { "run.phase": { $nin: ["searching", "scoring", "preparing"] } },
        { "run.updatedAt": { $lt: staleBefore } },
        { "run.updatedAt": null },
      ],
    },
    { $set: { "run.phase": "searching", "run.message": "Starting", "run.startedAt": new Date(), "run.updatedAt": new Date(), "run.stats": {}, status: "searching", lastError: "" } },
    { new: true },
  );
  return Boolean(claimed);
}

function dedupeKeyFor(job: { title: string; company: string; location: string }) {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const squash = (value: string) => norm(value).replace(/\b(pty|ltd|limited|inc|incorporated|llc|corp|corporation|group|australia|aus|au|anz)\b/g, " ").replace(/\s+/g, "");
  const city = norm(job.location).split(" ").slice(0, 1).join(" ");
  return `${norm(job.title)}::${squash(job.company)}::${city}`;
}

/** A board row with neither company nor location cannot be verified or applied to sensibly. */
function placeholderless(result: { company?: string; location?: string }) {
  return Boolean((result.company || "").trim() || (result.location || "").trim());
}

/** "AI Software Engineer / Senior Engineer AI Software Engineer": keep the first title when a slash part repeats it. */
export function cleanTitle(title: string) {
  const text = title.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
  const [first, ...rest] = text.split(/\s+\/\s+/);
  if (rest.length && rest.some((part) => part.toLowerCase().endsWith(first.toLowerCase()))) return first.trim();
  return text;
}

type Candidate = RankableJob & { discoveredVia: string; postedAt: string; snippet: string; applyUrl: string };

function isPlaceholder(company: string) {
  return !company.trim() || /^(tbh|unknown|confidential)$/i.test(company.trim());
}

export async function runPipeline(args: { sessionId: string; userId: string }) {
  const startedAt = Date.now();
  const { sessionId, userId } = args;
  const stats: Record<string, number> = {};
  const checkpoint = async () => {
    if (await isCancelled(sessionId)) throw new PipelineAbort("Run cancelled.");
  };
  const stopHeartbeat = startHeartbeat(sessionId);
  try {
    await connectToDatabase();
    const session = await AutoApplySessionModel.findOne({ _id: sessionId, userId });
    if (!session) throw new Error("Session not found.");
    const { profile } = await loadUserContext(userId);
    if (!hasUsableProfile(profile)) throw new Error("Add your CV to your profile first so applications can be tailored to you.");
    const filters = autoApplyFiltersSchema.parse(session.filters || {});
    const targetLocation = filters.location.trim() || "Australia";
    const candidateSummary = buildCandidateSummary(profile);
    const roleMatcher = buildRoleMatcher(session.prompt);

    // 1) Discover from employer ATS boards and job boards in parallel.
    await setRun(sessionId, "searching", "Searching employer career sites and job boards", stats, "searching");
    await logAutoApplyEvent({ userId, sessionId, type: "search_started", message: `Searching for "${session.prompt}" in ${targetLocation}.` });
    const boardSignal = AbortSignal.timeout(BOARD_CRAWL_MS);
    const boardResults: JobSearchResult[] = [];
    const blocked = new Set<string>();
    const boardTask = (async () => {
      try {
        for await (const event of streamSearchJobs(toSearchRequest(session.prompt, filters), { signal: boardSignal })) {
          if (event.type === "result") boardResults.push(event.result);
          if (event.type === "complete") event.blockedSources.forEach((source) => blocked.add(source));
          if (event.type === "source-progress" && event.status === "blocked") blocked.add(event.source);
        }
      } catch {
        // A timed-out or failing crawl keeps whatever it found so far.
      }
    })();
    const directoryTask = discoverFromDirectory({ prompt: session.prompt, location: targetLocation });
    const [directory] = await Promise.all([directoryTask, boardTask]);
    await checkpoint();

    const merged = new Map<string, Candidate>();
    for (const posting of directory.postings) {
      const key = dedupeKeyFor(posting);
      merged.set(key, {
        id: posting.jobId,
        source: posting.provider,
        title: posting.title,
        company: posting.company,
        location: posting.location,
        snippet: posting.descriptionText.slice(0, 400),
        descriptionText: posting.descriptionText,
        listingUrl: posting.listingUrl,
        applicationUrl: posting.applyUrl,
        applicationUrlType: "external",
        dedupeKey: `ats:${posting.provider}:${posting.board}:${posting.jobId}`,
        discoveredVia: "career_site",
        postedAt: posting.postedAt,
        applyUrl: posting.applyUrl,
      });
    }
    for (const result of boardResults) {
      const key = dedupeKeyFor(result);
      const placeholder = isPlaceholder(result.company);
      if (merged.has(key) && !placeholder) continue;
      if (!placeholderless(result)) continue;
      if (result.location && !matchesLocation(result.location, targetLocation, "")) continue;
      const boardKey = placeholder ? `${key}::${result.source}` : key;
      if (merged.has(boardKey)) continue;
      merged.set(boardKey, {
        ...fromSearchResult(result),
        discoveredVia: "job_board",
        postedAt: result.postedText || "",
        snippet: result.snippet || "",
        applyUrl: safeHttpUrl(result.applicationUrl) || safeHttpUrl(result.listingUrl),
      });
    }
    stats.found = merged.size;
    stats.careerSite = directory.postings.length;
    stats.boardResults = boardResults.length;
    stats.blockedSources = blocked.size;

    // 2) Heuristic ranking for every job, which decides who gets deep resolution.
    await setRun(sessionId, "scoring", `Analysing ${merged.size} roles`, stats, "scoring");
    const ranked = rankAutoApplyCandidates({
      jobs: [...merged.values()],
      prompt: session.prompt,
      groundTruthSnapshot: session.sessionGroundTruthSnapshot as { items?: [] },
      mustHaveKeywords: filters.mustHaveKeywords,
      excludeKeywords: filters.excludeKeywords,
      companyBlacklist: filters.companyBlacklist,
    });
    const extraByKey = new Map([...merged.values()].map((candidate) => [candidate.dedupeKey, candidate]));
    const ordered = ranked
      .map((job) => ({ job, extra: extraByKey.get(job.dedupeKey) as Candidate | undefined }))
      .sort((left, right) => right.job.fitScore + (right.extra?.discoveredVia === "career_site" ? 12 : 0) - (left.job.fitScore + (left.extra?.discoveredVia === "career_site" ? 12 : 0)));
    // One posting can arrive under several requisition ids or boards: keep the best-ranked row per apply URL.
    const seenApply = new Set<string>();
    for (const entry of ordered) {
      const url = safeHttpUrl(entry.job.applicationUrl) || "";
      if (!url) continue;
      if (seenApply.has(url)) entry.job.status = "skipped";
      else seenApply.add(url);
    }
    for (const entry of ordered) {
      entry.job.title = cleanTitle(entry.job.title);
    }
    const eligible = ordered.filter((entry) => entry.job.status !== "skipped");
    const deep = eligible.slice(0, SCORE_TOP_N);

    // 3) Resolve employer forms for the best candidates, then score with the LLM.
    const resolvedByKey = new Map<string, ResolvedJob>();
    await mapWithConcurrency(deep, 6, async ({ job, extra }) => {
      if (Date.now() - startedAt > RUN_BUDGET_MS * 0.6) return;
      try {
        const resolved = await resolveJob({
          title: job.title,
          company: job.company,
          location: job.location,
          listingUrl: job.listingUrl || "",
          applyUrl: job.applicationUrl || extra?.applyUrl || "",
          descriptionText: job.descriptionText || "",
          targetLocation,
          signal: AbortSignal.timeout(20_000),
        });
        resolvedByKey.set(job.dedupeKey, resolved);
      } catch {
        // The job keeps its board data and is resolved again at prepare time.
      }
    });
    stats.resolved = resolvedByKey.size;
    stats.employerForms = [...resolvedByKey.values()].filter((entry) => entry.formSource === "employer_schema").length;
    await checkpoint();
    await setRun(sessionId, "scoring", "Scoring fit against your CV", stats, "scoring");

    const fitInputs = deep.map(({ job }) => ({
      id: job.dedupeKey,
      title: job.title,
      company: resolvedByKey.get(job.dedupeKey)?.company || job.company,
      location: job.location,
      description: resolvedByKey.get(job.dedupeKey)?.descriptionText || job.descriptionText || job.snippet || "",
    }));
    const fits = await scoreJobsWithLlm({ candidate: candidateSummary, targetRole: session.prompt, jobs: fitInputs, signal: AbortSignal.timeout(90_000) });
    stats.llmScored = fits.size;

    // 4) Persist every candidate. User-owned stages are never overwritten by a re-run.
    const operations = ordered.map(({ job, extra }) => {
      const resolved = resolvedByKey.get(job.dedupeKey);
      const fit = fits.get(job.dedupeKey);
      const ats = resolved ? resolved.ats : detectAts(job.applicationUrl || job.listingUrl);
      let score = fit ? fit.score : Math.min(job.fitScore, 58);
      // Guards the model cannot talk its way past: the posting's own location must fit, and a board result needs a matching title.
      const finalLocation = (resolved?.location || job.location || "").trim();
      if (!finalLocation) score = Math.min(score, SELECT_MIN_SCORE - 1);
      else if (!matchesLocation(finalLocation, targetLocation, "")) score = Math.min(score, 40);
      if (extra?.discoveredVia === "job_board" && !matchesRole(job.title, roleMatcher)) score = Math.min(score, 74);
      const reasons = fit?.reasons.length ? fit.reasons : job.fitReasons;
      const applyUrl = resolved?.applyUrl || safeHttpUrl(job.applicationUrl) || safeHttpUrl(job.listingUrl);
      const company = resolved?.company && !isPlaceholder(resolved.company) ? resolved.company : job.company;
      return {
        updateOne: {
          filter: { sessionId: new Types.ObjectId(sessionId), dedupeKey: job.dedupeKey },
          update: {
            $set: {
              userId: new Types.ObjectId(userId),
              source: String(job.source),
              sourceJobId: job.id || "",
              title: job.title,
              company,
              location: resolved?.location || job.location,
              url: safeHttpUrl(job.listingUrl),
              applyUrl,
              applyUrlType: ats.provider === "jobboard" || ats.provider === "unknown" ? "board-detail" : "external",
              descriptionText: (resolved?.descriptionText || job.descriptionText || "").slice(0, 20000),
              snippet: (job.snippet || "").slice(0, 400),
              postedAt: extra?.postedAt || "",
              discoveredVia: extra?.discoveredVia || "job_board",
              fitScore: score,
              heuristicScore: job.fitScore,
              fitVerdict: fit?.verdict || "",
              scoredBy: fit ? "llm" : "heuristic",
              fitReasons: reasons,
              fitGaps: fit?.gaps || job.missingRequirements,
              missingRequirements: fit?.gaps || job.missingRequirements,
              riskFlags: job.riskFlags.filter((flag) => !flag.startsWith("restricted")),
              applicationStrategy: resolved?.formSource === "employer_schema" ? "Employer application form read; answers drafted from your profile." : "Standard application pack prepared for this listing.",
              ats: resolved ? { provider: ats.provider, board: ats.board, jobId: ats.jobId, matchedBy: resolved.ats.matchedBy, confidence: resolved.ats.confidence } : { provider: ats.provider, board: ats.board, jobId: ats.jobId, matchedBy: "", confidence: 0 },
              formSource: resolved?.formSource || "",
              questions: resolved?.questions || [],
              resolvedAt: resolved ? new Date() : null,
              resolutionNotes: resolved?.notes || [],
            },
            $setOnInsert: { dedupeKey: job.dedupeKey, status: job.status === "skipped" ? "skipped" : "discovered", stageHistory: [{ stage: "discovered", at: new Date(), note: "Found by search" }] },
          },
          upsert: true,
        },
      };
    });
    if (operations.length) await AutoApplyJobCandidateModel.bulkWrite(operations as never, { ordered: false });
    await AutoApplyJobCandidateModel.updateMany(
      { sessionId, status: "discovered", fitScore: { $gte: SELECT_MIN_SCORE }, riskFlags: { $not: { $elemMatch: { $regex: "^(blacklisted|excluded)" } } } },
      { $set: { status: "shortlisted" } },
    );
    await logAutoApplyEvent({ userId, sessionId, type: "search_completed", message: `Found ${merged.size} roles (${directory.postings.length} on employer career sites). Scored the top ${fits.size} against your CV.`, payload: stats });
    await checkpoint();

    if (session.mode === "manual_curate") {
      await setRun(sessionId, "idle", "Pick the roles you want, then prepare them", stats, "awaiting_selection");
      return { stats };
    }

    // 5) Autopilot: select the best matches up to the application limit and prepare them.
    await autoSelect(sessionId, filters.applicationLimit);
    await preparePending({ sessionId, userId, startedAt, stats });
    return { stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed.";
    if (error instanceof PipelineAbort) {
      await AutoApplySessionModel.updateOne({ _id: sessionId }, { $set: { "run.phase": "idle", "run.message": "Stopped", "run.updatedAt": new Date(), status: "stopped", stoppedAt: new Date() } });
      await logAutoApplyEvent({ userId, sessionId, type: "run_cancelled", message: "Run stopped." });
    } else {
      await AutoApplySessionModel.updateOne({ _id: sessionId }, { $set: { "run.phase": "failed", "run.message": message, "run.updatedAt": new Date(), status: "failed", lastError: message } });
      await logAutoApplyEvent({ userId, sessionId, type: "run_failed", message });
    }
    return { stats, error: message };
  } finally {
    stopHeartbeat();
  }
}

export async function autoSelect(sessionId: string, limit: number) {
  const active = await AutoApplyJobCandidateModel.countDocuments({
    sessionId,
    status: { $in: ["selected", "preparing", "needs_input", "prepared", "approved", "applied", "ready_for_review", "submitted"] },
  });
  const slots = Math.max(0, limit - active);
  if (!slots) return 0;
  const pool = await AutoApplyJobCandidateModel.find({ sessionId, status: { $in: ["shortlisted"] }, fitScore: { $gte: SELECT_MIN_SCORE } })
    .select("_id fitScore formSource")
    .lean();
  // Roles whose real employer form was read can be autofilled end to end, so they get a small ordering bonus.
  const picks = pool
    .map((job) => ({ _id: job._id, rank: job.fitScore + (job.formSource === "employer_schema" ? 6 : 0) }))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, slots);
  if (!picks.length) return 0;
  await AutoApplyJobCandidateModel.updateMany(
    { _id: { $in: picks.map((pick) => pick._id) } },
    { $set: { status: "selected" }, $push: { stageHistory: { stage: "selected", at: new Date(), note: "Auto-selected by fit" } } },
  );
  return picks.length;
}

export async function preparePending(args: { sessionId: string; userId: string; startedAt?: number; stats?: Record<string, number> }) {
  const startedAt = args.startedAt || Date.now();
  const stats = args.stats || {};
  const pending = await AutoApplyJobCandidateModel.find({ sessionId: args.sessionId, status: "selected" }).sort({ fitScore: -1 }).select("_id").lean();
  stats.toPrepare = pending.length;
  if (!pending.length) {
    await setRun(args.sessionId, "idle", "Nothing left to prepare", stats, "review");
    return;
  }
  await setRun(args.sessionId, "preparing", `Preparing ${pending.length} applications`, stats, "preparing");
  let done = 0;
  await mapWithConcurrency(pending, 3, async (entry) => {
    if (Date.now() - startedAt > RUN_BUDGET_MS) return;
    if (await isCancelled(args.sessionId)) return;
    const result = await prepareJobById({ jobId: entry._id.toString(), userId: args.userId });
    done += 1;
    stats.prepared = (stats.prepared || 0) + (result === "prepared" ? 1 : 0);
    stats.needsInput = (stats.needsInput || 0) + (result === "needs_input" ? 1 : 0);
    stats.failed = (stats.failed || 0) + (result === "failed" ? 1 : 0);
    await setRun(args.sessionId, "preparing", `Prepared ${done} of ${pending.length}`, stats, "preparing");
  });
  if (await isCancelled(args.sessionId)) {
    await AutoApplySessionModel.updateOne({ _id: args.sessionId }, { $set: { "run.phase": "idle", "run.message": "Stopped", "run.updatedAt": new Date(), status: "stopped", stoppedAt: new Date() } });
    await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "run_cancelled", message: "Run stopped." });
    return;
  }
  const remaining = await AutoApplyJobCandidateModel.countDocuments({ sessionId: args.sessionId, status: "selected" });
  const message = remaining
    ? `${remaining} applications still queued; run again to continue`
    : "Applications ready to review";
  await setRun(args.sessionId, "idle", message, stats, "review");
  await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "prepare_completed", message, payload: stats });
}

export type PrepareOutcome = "prepared" | "needs_input" | "failed" | "busy" | "missing";

export async function prepareJobById(args: { jobId: string; userId: string; force?: boolean }): Promise<PrepareOutcome> {
  await connectToDatabase();
  const staleBefore = new Date(Date.now() - PREPARE_LOCK_MS);
  const lockable = ["discovered", "shortlisted", "selected", "needs_input", "prepared", "failed"];
  const job = await AutoApplyJobCandidateModel.findOneAndUpdate(
    {
      _id: args.jobId,
      userId: args.userId,
      $or: [{ status: { $in: lockable } }, { status: "preparing", preparingStartedAt: { $lt: staleBefore } }],
    },
    { $set: { status: "preparing", preparingStartedAt: new Date(), lastError: "" }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!job) return (await AutoApplyJobCandidateModel.exists({ _id: args.jobId, userId: args.userId })) ? "busy" : "missing";

  const sessionId = job.sessionId.toString();
  try {
    const session = await AutoApplySessionModel.findOne({ _id: job.sessionId, userId: args.userId });
    const filters = autoApplyFiltersSchema.parse(session?.filters || {});
    const { profile, storedPreferences, memory } = await loadUserContext(args.userId);
    const preferences = mergePreferences(storedPreferences, session?.preferences as Partial<ApplicantPreferences>);
    const cached: ResolvedJob | null =
      job.questions?.length && job.formSource
        ? {
            ats: { provider: (job.ats?.provider || "unknown") as ResolvedJob["ats"]["provider"], board: job.ats?.board || "", jobId: job.ats?.jobId || "", matchedBy: (job.ats?.matchedBy || "none") as ResolvedJob["ats"]["matchedBy"], confidence: job.ats?.confidence || 0 },
            applyUrl: job.applyUrl || job.url,
            listingUrl: job.url,
            descriptionText: job.descriptionText,
            questions: job.questions as unknown as FormQuestion[],
            formSource: job.formSource as ResolvedJob["formSource"],
            company: job.company,
            location: job.location,
            notes: job.resolutionNotes || [],
          }
        : null;
    const prepared = await prepareApplication({
      job: { title: job.title, company: job.company, location: job.location, url: job.url, applyUrl: job.applyUrl, descriptionText: job.descriptionText },
      profile,
      preferences,
      memory,
      targetLocation: filters.location || "Australia",
      resolved: cached,
      signal: AbortSignal.timeout(150_000),
    });
    const missing = countMissing(prepared.answers);
    const stage = missing ? "needs_input" : "prepared";
    const applyUrl = prepared.resolved.applyUrl || job.applyUrl;
    const payloadHash = hashApplicationPayload({ answers: prepared.answers, coverLetter: prepared.coverLetter, applyUrl });

    await AutoApplyApplicationDraftModel.findOneAndUpdate(
      { sessionId: job.sessionId, jobCandidateId: job._id },
      {
        $set: {
          userId: args.userId,
          sessionId: job.sessionId,
          jobCandidateId: job._id,
          coverLetterText: prepared.coverLetter,
          employerQuestions: prepared.resolved.questions,
          answers: prepared.answers,
          uncertaintyFlags: prepared.answers.filter((answer) => answer.needsInput || answer.confidence < 0.6).map((answer) => answer.questionId),
          generatedApplicationSummary: `${job.title} at ${prepared.resolved.company || job.company}. ${job.fitReasons[0] || ""}`.trim(),
          riskNotes: prepared.warnings,
          finalReviewStatus: missing ? "needs_input" : "ready",
          applyUrl,
          formSource: prepared.resolved.formSource,
          payloadHash,
          generatedBy: prepared.generatedBy,
          preparedAt: new Date(),
          approvedAt: null,
        },
      },
      { upsert: true, new: true },
    );
    await AutoApplyJobCandidateModel.updateOne(
      { _id: job._id },
      {
        $set: {
          status: stage,
          applyUrl,
          company: prepared.resolved.company || job.company,
          descriptionText: (prepared.resolved.descriptionText || job.descriptionText).slice(0, 20000),
          ats: { provider: prepared.resolved.ats.provider, board: prepared.resolved.ats.board, jobId: prepared.resolved.ats.jobId, matchedBy: prepared.resolved.ats.matchedBy, confidence: prepared.resolved.ats.confidence },
          formSource: prepared.resolved.formSource,
          questions: prepared.resolved.questions,
          resolutionNotes: prepared.resolved.notes,
          preparingStartedAt: null,
        },
        $push: { stageHistory: { stage, at: new Date(), note: missing ? `${missing} answers need you` : "Application pack ready" } },
      },
    );
    await AutoApplySessionModel.updateOne({ _id: job.sessionId }, { $set: { currentJobCandidateId: job._id } });
    await logAutoApplyEvent({
      userId: args.userId,
      sessionId,
      jobCandidateId: job._id.toString(),
      type: stage === "prepared" ? "draft_ready" : "needs_input",
      message: stage === "prepared" ? `Application ready: ${job.title} at ${prepared.resolved.company || job.company}.` : `${job.title}: ${missing} answers need your input.`,
    });
    return stage;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preparation failed.";
    await AutoApplyJobCandidateModel.updateOne(
      { _id: job._id },
      { $set: { status: "failed", lastError: message, preparingStartedAt: null }, $push: { stageHistory: { stage: "failed", at: new Date(), note: message } } },
    );
    await logAutoApplyEvent({ userId: args.userId, sessionId, jobCandidateId: job._id.toString(), type: "prepare_failed", message: `${job.title}: ${message}` });
    return "failed";
  }
}

/**
 * Re-applies standing answers (preferences, remembered answers, profile) to drafts that still have unanswered
 * questions. No model calls: only deterministic answers are filled, so this is instant and safe to repeat.
 */
export async function refreshStandingAnswers(args: { sessionId: string; userId: string }) {
  const { profile, storedPreferences, memory } = await loadUserContext(args.userId);
  const session = await AutoApplySessionModel.findOne({ _id: args.sessionId, userId: args.userId }).lean();
  const preferences = mergePreferences(storedPreferences, session?.preferences as Partial<ApplicantPreferences>);
  const contact = candidateContact(profile, preferences);
  const jobs = await AutoApplyJobCandidateModel.find({ sessionId: args.sessionId, userId: args.userId, status: { $in: ["needs_input", "prepared"] } });
  let updated = 0;
  for (const job of jobs) {
    const draft = await AutoApplyApplicationDraftModel.findOne({ jobCandidateId: job._id, userId: args.userId });
    if (!draft) continue;
    const questions = (draft.employerQuestions || []) as unknown as FormQuestion[];
    const byId = new Map(questions.map((question) => [question.id, question]));
    let changed = false;
    const next = ((draft.answers || []) as unknown as DraftAnswer[]).map((answer) => {
      if (!answer.needsInput && answer.value) return answer;
      const question = byId.get(answer.questionId);
      if (!question) return answer;
      const filled = answerDeterministically({ question, profile: contact, preferences, memory, company: job.company });
      if (filled && filled.value && !filled.needsInput) {
        changed = true;
        return filled;
      }
      return answer;
    });
    if (!changed) continue;
    const missing = countMissing(next);
    const stage = missing ? "needs_input" : "prepared";
    await draft.updateOne({
      $set: {
        answers: next,
        finalReviewStatus: missing ? "needs_input" : "ready",
        payloadHash: hashApplicationPayload({ answers: next, coverLetter: draft.coverLetterText, applyUrl: draft.applyUrl }),
      },
    });
    if (job.status !== stage) {
      await AutoApplyJobCandidateModel.updateOne({ _id: job._id }, { $set: { status: stage }, $push: { stageHistory: { stage, at: new Date(), note: "Standing answers applied" } } });
    }
    updated += 1;
  }
  if (updated) {
    await logAutoApplyEvent({ userId: args.userId, sessionId: args.sessionId, type: "answers_refreshed", message: `Applied your standing answers to ${updated} application${updated === 1 ? "" : "s"}.` });
  }
  return updated;
}

export function answersFromDraft(draft: { answers?: unknown } | null): DraftAnswer[] {
  return Array.isArray(draft?.answers) ? (draft!.answers as DraftAnswer[]) : [];
}

export { normalizeStage, isJobBoardUrl };
