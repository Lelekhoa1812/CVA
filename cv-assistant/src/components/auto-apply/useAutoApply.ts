"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEARCH_SOURCES } from "@/lib/search/types";
import { autoApplyApi, ApiError } from "./api";
import { RUNNING_PHASES, type ApplicantPreferences, type BriefForm, type JobDetail, type SessionData, type SessionSummary } from "./types";

export const EMPTY_PREFS: ApplicantPreferences = {
  workRights: "",
  requiresSponsorship: "",
  salaryExpectation: "",
  noticePeriod: "",
  currentLocation: "",
  willingToRelocate: "",
  hybridOk: "",
  howHeard: "",
  github: "",
  currentCompany: "",
  standingConsent: "",
};

export const DEFAULT_BRIEF: BriefForm = {
  prompt: "",
  mode: "ai_coaching",
  location: "",
  applicationLimit: 10,
  autoApproveMinFit: 0,
  seniority: "",
  workplaceMode: "any",
  employmentType: "any",
  mustHaveKeywords: "",
  excludeKeywords: "",
  companyBlacklist: "",
  selectedSources: [...SEARCH_SOURCES],
};

export type Notice = { kind: "success" | "error" | "info"; message: string; id: number };
export type StepId = "brief" | "matches" | "review" | "apply";

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useAutoApply() {
  const [brief, setBriefState] = useState<BriefForm>(DEFAULT_BRIEF);
  const [prefs, setPrefsState] = useState<ApplicantPreferences>(EMPTY_PREFS);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<SessionData | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [step, setStep] = useState<StepId>("brief");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const noticeId = useRef(0);
  const briefDirty = useRef(false);
  const lastPhase = useRef<string>("");

  const notify = useCallback((kind: Notice["kind"], text: string) => {
    noticeId.current += 1;
    setNotice({ kind, message: text, id: noticeId.current });
  }, []);

  const setBusyKey = useCallback((key: string, value: boolean) => setBusy((current) => ({ ...current, [key]: value })), []);

  const setBrief = useCallback((patch: Partial<BriefForm>) => {
    briefDirty.current = true;
    setBriefState((current) => ({ ...current, ...patch }));
  }, []);

  const setPrefs = useCallback((patch: Partial<ApplicantPreferences>) => {
    setPrefsDirty(true);
    setPrefsState((current) => ({ ...current, ...patch }));
  }, []);

  const refresh = useCallback(async (id: string | null = activeId) => {
    if (!id) return null;
    try {
      const next = await autoApplyApi.getSession(id);
      setData(next);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setActiveId(null);
        setData(null);
      }
      return null;
    }
  }, [activeId]);

  // Initial load: sessions + preferences. Never overwrites fields the user has started typing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sessionResult, prefResult] = await Promise.allSettled([autoApplyApi.listSessions(), autoApplyApi.getPreferences()]);
      if (cancelled) return;
      if (sessionResult.status === "fulfilled") {
        setSessions(sessionResult.value.sessions);
        const latest = sessionResult.value.sessions[0];
        if (latest) {
          setActiveId(latest._id);
          if (!briefDirty.current) {
            setBriefState((current) => ({
              ...current,
              prompt: latest.prompt,
              mode: latest.mode,
              location: latest.filters?.location || "",
              applicationLimit: latest.filters?.applicationLimit || 10,
              autoApproveMinFit: latest.filters?.autoApproveMinFit || 0,
              selectedSources: latest.filters?.selectedSources?.length ? latest.filters.selectedSources : current.selectedSources,
            }));
          }
        }
      } else notify("error", message(sessionResult.reason, "Could not load your sessions."));
      if (prefResult.status === "fulfilled") {
        setPrefsState({ ...EMPTY_PREFS, ...prefResult.value.preferences });
        setHasProfile(prefResult.value.hasProfile);
        setProfileName(prefResult.value.profileName);
      } else setHasProfile(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  // Load the active session, and decide which step to show the first time.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      const next = await refresh(activeId);
      if (cancelled || !next) return;
      const counts = next.counts;
      setStep((current) => {
        if (current !== "brief") return current;
        if (RUNNING_PHASES.has(next.session.run?.phase || "")) return "matches";
        if (counts.approved || counts.applied) return "apply";
        if (counts.prepared || counts.needs_input) return "review";
        if (counts.total) return "matches";
        return current;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, refresh]);

  const running = RUNNING_PHASES.has(data?.session.run?.phase || "");

  // Poll while a run is active (and once more after it ends to settle).
  useEffect(() => {
    if (!activeId || !running) return;
    const timer = window.setInterval(() => void refresh(activeId), 2500);
    return () => window.clearInterval(timer);
  }, [activeId, running, refresh]);

  useEffect(() => {
    const phase = data?.session.run?.phase || "";
    if (lastPhase.current && RUNNING_PHASES.has(lastPhase.current) && !RUNNING_PHASES.has(phase)) {
      if (phase === "failed") notify("error", data?.session.run?.message || "The run failed.");
      else if (data?.session.status === "stopped") notify("info", "Run stopped.");
      else {
        const counts = data?.counts;
        if (counts && (counts.prepared || counts.needs_input)) {
          notify("success", `${counts.prepared + counts.needs_input} applications prepared.`);
          setStep("review");
        } else if (counts?.total) {
          notify("success", `Found ${counts.total} roles.`);
          setStep("matches");
        }
      }
    }
    lastPhase.current = phase;
  }, [data, notify]);

  const savePrefs = useCallback(async () => {
    try {
      const result = await autoApplyApi.savePreferences(prefs);
      setPrefsState({ ...EMPTY_PREFS, ...result.preferences });
      setPrefsDirty(false);
      // Existing applications waiting on these answers are filled in immediately.
      if (activeId && (data?.counts.needs_input || 0) > 0) {
        try {
          const { updated } = await autoApplyApi.refreshAnswers(activeId);
          if (updated) {
            notify("success", `Applied your standing answers to ${updated} application${updated === 1 ? "" : "s"}.`);
            await refresh(activeId);
          }
        } catch {
          // The preferences are saved; refreshing existing drafts is best effort.
        }
      }
      return true;
    } catch (error) {
      notify("error", message(error, "Could not save your preferences."));
      return false;
    }
  }, [prefs, notify, activeId, data, refresh]);

  const start = useCallback(
    async (opts: { fresh?: boolean } = {}) => {
      if (!brief.prompt.trim()) {
        notify("error", "Describe the role you want first, for example “AI Engineer”.");
        return;
      }
      if (!brief.selectedSources.length) {
        notify("error", "Choose at least one source to search.");
        return;
      }
      setBusyKey("start", true);
      try {
        if (prefsDirty && !(await savePrefs())) return;
        let id = opts.fresh ? null : activeId;
        if (id) await autoApplyApi.updateSession(id, brief);
        else {
          const created = await autoApplyApi.createSession(brief);
          id = created.session._id;
          setSessions((current) => [created.session, ...current]);
          setActiveId(id);
        }
        await autoApplyApi.run(id);
        setStep("matches");
        await refresh(id);
      } catch (error) {
        notify("error", message(error, "Could not start the search."));
      } finally {
        setBusyKey("start", false);
      }
    },
    [brief, prefsDirty, savePrefs, activeId, notify, refresh, setBusyKey],
  );

  const cancel = useCallback(async () => {
    if (!activeId) return;
    try {
      await autoApplyApi.cancel(activeId);
      notify("info", "Stopping after the current step.");
    } catch (error) {
      notify("error", message(error, "Could not stop the run."));
    }
  }, [activeId, notify]);

  const openJob = useCallback(async (id: string | null) => {
    setSelectedJobId(id);
    setDetail(null);
    if (!id) return;
    setDetailLoading(true);
    try {
      setDetail(await autoApplyApi.getJob(id));
    } catch (error) {
      notify("error", message(error, "Could not load this application."));
    } finally {
      setDetailLoading(false);
    }
  }, [notify]);

  const reloadDetail = useCallback(async () => {
    if (selectedJobId) {
      try {
        setDetail(await autoApplyApi.getJob(selectedJobId));
      } catch {
        // keep the previous detail
      }
    }
    await refresh();
  }, [selectedJobId, refresh]);

  const act = useCallback(
    async (key: string, work: () => Promise<unknown>, success?: string) => {
      setBusyKey(key, true);
      try {
        await work();
        if (success) notify("success", success);
        await reloadDetail();
        return true;
      } catch (error) {
        notify("error", message(error, "That did not work."));
        await reloadDetail();
        return false;
      } finally {
        setBusyKey(key, false);
      }
    },
    [notify, reloadDetail, setBusyKey],
  );

  const newSearch = useCallback(() => {
    setActiveId(null);
    setData(null);
    setSelectedJobId(null);
    setDetail(null);
    setStep("brief");
  }, []);

  const resumeSession = useCallback((session: SessionSummary) => {
    briefDirty.current = true;
    setBriefState((current) => ({
      ...current,
      prompt: session.prompt,
      mode: session.mode,
      location: session.filters?.location || "",
      applicationLimit: session.filters?.applicationLimit || 10,
      autoApproveMinFit: session.filters?.autoApproveMinFit || 0,
      selectedSources: session.filters?.selectedSources?.length ? session.filters.selectedSources : current.selectedSources,
    }));
    setSelectedJobId(null);
    setDetail(null);
    setActiveId(session._id);
    setStep("matches");
  }, []);

  const counts = data?.counts;
  const steps = useMemo(() => {
    const c = counts;
    const has = (value?: number) => Boolean(value);
    return {
      matches: has(c?.total),
      review: has((c?.prepared || 0) + (c?.needs_input || 0) + (c?.approved || 0) + (c?.applied || 0)),
      // Reachable once anything is ready, so "Nothing approved yet" guides people to Review instead of a dead button.
      apply: has((c?.prepared || 0) + (c?.needs_input || 0) + (c?.approved || 0) + (c?.applied || 0)),
    };
  }, [counts]);

  return {
    brief, setBrief, prefs, setPrefs, prefsDirty, savePrefs, profileName, hasProfile,
    sessions, activeId, data, running, loading, step, setStep, steps,
    selectedJobId, detail, detailLoading, openJob, reloadDetail,
    busy, act, notice, setNotice, notify,
    start, cancel, newSearch, resumeSession, refresh,
  };
}

export type AutoApplyController = ReturnType<typeof useAutoApply>;
