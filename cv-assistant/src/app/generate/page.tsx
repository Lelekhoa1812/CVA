"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { StaggerGroup, StaggerItem } from "@/components/motion/Reveal";
import { buildApiUrl } from "@/lib/api";
import ClarificationQuestions, { type ClarificationAnswer, type ClarificationQuestion } from "@/components/generate/ClarificationQuestions";
import MobileGenerateBar from "@/components/generate/MobileGenerateBar";
import ResultBlock from "@/components/generate/ResultBlock";
import SectionNavigator, { type GenerateStep } from "@/components/generate/SectionNavigator";
import TracePanel from "@/components/generate/TracePanel";
import { ChoiceRow, DetailsToggle, DisclosureSection, SelectableRow } from "@/components/generate/WorkspaceChrome";
import { sanitizeClarificationQuestions } from "@/lib/generate/clarifications";

type Project = { name: string; summary: string; description: string };
type Experience = { companyName: string; role: string; summary: string; description: string };
type Profile = { projects: Project[]; experiences: Experience[] };
type RankedEvidence = {
  index: number;
  type: "project" | "experience";
  title: string;
  summary: string;
  justification: string;
};

type AdvancedTrace = {
  mode?: "advanced";
  roleFocus?: string;
  missingCriticalRequirements?: string[];
  supplementalEvidenceTitles?: string[];
  uncoveredRequirements?: string[];
  reviewerNotes?: string[];
  finalEvidenceCount?: number;
  coverageSummary?: string[];
};

type SavedDraft = {
  company: string;
  jobDescription: string;
  employerQuestion: string;
  idealWordCount: string;
  answerStyle: string;
  shouldSelect: boolean;
  advancedMode: boolean;
  indices: number[] | null;
  rankings: RankedEvidence[];
  result: string;
  employerQuestionResult: string;
  advancedTrace: AdvancedTrace | null;
  questionAdvancedTrace: AdvancedTrace | null;
  letterReviewWarning?: string;
  answerReviewWarning?: string;
  manualSelection: { projects: number[]; experiences: number[] };
  enableManualSelection: boolean;
  showManualEvidence: boolean;
};

const DRAFT_STORAGE_KEY = "cv-assistant.generate.cover-letter.v3";
const FIELD_CLASS = "input-premium scroll-mt-40 scroll-mb-28 text-base sm:text-sm lg:scroll-mt-24 lg:scroll-mb-0";
const ACTION_CLASS = "scroll-mt-40 scroll-mb-28 lg:scroll-mt-24 lg:scroll-mb-0";

const GENERATE_STEPS: readonly GenerateStep[] = [
  { id: "job-brief", shortLabel: "Brief", label: "Job brief" },
  { id: "evidence-selection", shortLabel: "Evidence", label: "Evidence" },
  { id: "generated-letter", shortLabel: "Letter", label: "Letter" },
  { id: "employer-question", shortLabel: "Answer", label: "Employer answer" },
];

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
}

function normalizeTrace(value: unknown): AdvancedTrace | null {
  if (!value || typeof value !== "object") return null;
  const trace = value as AdvancedTrace;
  return {
    mode: trace.mode === "advanced" ? "advanced" : undefined,
    roleFocus: typeof trace.roleFocus === "string" ? trace.roleFocus : "",
    missingCriticalRequirements: Array.isArray(trace.missingCriticalRequirements)
      ? trace.missingCriticalRequirements.filter((item): item is string => typeof item === "string")
      : [],
    supplementalEvidenceTitles: Array.isArray(trace.supplementalEvidenceTitles)
      ? trace.supplementalEvidenceTitles.filter((item): item is string => typeof item === "string")
      : [],
    uncoveredRequirements: Array.isArray(trace.uncoveredRequirements)
      ? trace.uncoveredRequirements.filter((item): item is string => typeof item === "string")
      : [],
    reviewerNotes: Array.isArray(trace.reviewerNotes)
      ? trace.reviewerNotes.filter((item): item is string => typeof item === "string")
      : [],
    finalEvidenceCount: typeof trace.finalEvidenceCount === "number" ? trace.finalEvidenceCount : undefined,
    coverageSummary: Array.isArray(trace.coverageSummary)
      ? trace.coverageSummary.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0))]
    : [];
}

function clampManualSelection(
  selection: { projects: number[]; experiences: number[] },
  profile: Profile,
) {
  return {
    projects: selection.projects.filter((index) => index < (profile.projects?.length || 0)),
    experiences: selection.experiences.filter((index) => index < (profile.experiences?.length || 0)),
  };
}

function loadSavedDraft(): SavedDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedDraft>;

    return {
      company: typeof parsed.company === "string" ? parsed.company : "",
      jobDescription: typeof parsed.jobDescription === "string" ? parsed.jobDescription : "",
      employerQuestion: typeof parsed.employerQuestion === "string" ? parsed.employerQuestion : "",
      idealWordCount: typeof parsed.idealWordCount === "string" ? parsed.idealWordCount : "",
      answerStyle: typeof parsed.answerStyle === "string" ? parsed.answerStyle : "",
      shouldSelect: typeof parsed.shouldSelect === "boolean" ? parsed.shouldSelect : true,
      advancedMode: typeof parsed.advancedMode === "boolean" ? parsed.advancedMode : false,
      indices: Array.isArray(parsed.indices) ? normalizeNumberArray(parsed.indices) : null,
      rankings: Array.isArray(parsed.rankings) ? (parsed.rankings as RankedEvidence[]) : [],
      result: typeof parsed.result === "string" ? parsed.result : "",
      employerQuestionResult:
        typeof parsed.employerQuestionResult === "string" ? parsed.employerQuestionResult : "",
      advancedTrace: normalizeTrace(parsed.advancedTrace),
      questionAdvancedTrace: normalizeTrace(parsed.questionAdvancedTrace),
      letterReviewWarning: typeof parsed.letterReviewWarning === "string" ? parsed.letterReviewWarning : "",
      answerReviewWarning: typeof parsed.answerReviewWarning === "string" ? parsed.answerReviewWarning : "",
      manualSelection: {
        projects: normalizeNumberArray(parsed.manualSelection?.projects),
        experiences: normalizeNumberArray(parsed.manualSelection?.experiences),
      },
      enableManualSelection: typeof parsed.enableManualSelection === "boolean" ? parsed.enableManualSelection : false,
      showManualEvidence: typeof parsed.showManualEvidence === "boolean" ? parsed.showManualEvidence : true,
    };
  } catch {
    return null;
  }
}

export default function GeneratePage() {
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [employerQuestion, setEmployerQuestion] = useState("");
  const [idealWordCount, setIdealWordCount] = useState("");
  const [answerStyle, setAnswerStyle] = useState("");
  const [shouldSelect, setShouldSelect] = useState(true);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [indices, setIndices] = useState<number[] | null>(null);
  const [rankings, setRankings] = useState<RankedEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [result, setResult] = useState("");
  const [employerQuestionResult, setEmployerQuestionResult] = useState("");
  const [advancedTrace, setAdvancedTrace] = useState<AdvancedTrace | null>(null);
  const [questionAdvancedTrace, setQuestionAdvancedTrace] = useState<AdvancedTrace | null>(null);
  const [letterReviewWarning, setLetterReviewWarning] = useState("");
  const [answerReviewWarning, setAnswerReviewWarning] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const [manualSelection, setManualSelection] = useState<{ projects: number[]; experiences: number[] }>({
    projects: [],
    experiences: [],
  });
  const [enableManualSelection, setEnableManualSelection] = useState(false);
  const [showManualEvidence, setShowManualEvidence] = useState(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [employerOpen, setEmployerOpen] = useState(false);
  const [answerOptionsOpen, setAnswerOptionsOpen] = useState(false);
  const disclosureReadyRef = useRef(false);
  const rankingsSignatureRef = useRef<string | null>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const [preparingGuidance, setPreparingGuidance] = useState<"cover-letter" | "employer-question" | null>(null);
  const [guidance, setGuidance] = useState<{ kind: "cover-letter" | "employer-question"; signature: string; questions: ClarificationQuestion[] } | null>(null);
  const [guidanceNotice, setGuidanceNotice] = useState<{ kind: "cover-letter" | "employer-question"; message: string } | null>(null);
  const guidanceRequestRef = useRef<AbortController | null>(null);
  const guidanceSignature = JSON.stringify({ company, jobDescription, employerQuestion, idealWordCount, answerStyle, advancedMode, indices, manualSelection, enableManualSelection, shouldSelect });
  const guidanceSignatureRef = useRef(guidanceSignature);
  guidanceSignatureRef.current = guidanceSignature;
  const selectionRequestRef = useRef<AbortController | null>(null);
  const previousDraftRef = useRef<{ jobDescription: string; shouldSelect: boolean }>({
    jobDescription: "",
    shouldSelect: true,
  });

  async function selectRelevant() {
    if (!jobDescription.trim() || !shouldSelect || selectionRequestRef.current) return;
    const controller = new AbortController();
    selectionRequestRef.current = controller;
    setError(null);
    setSelectionLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/generate/select"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
        signal: controller.signal,
      });
      if (selectionRequestRef.current !== controller || controller.signal.aborted) return;
      const data = await res.json().catch(() => ({}));
      if (selectionRequestRef.current !== controller || controller.signal.aborted) return;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not rank evidence. Please try again.");
        return;
      }
      setIndices(Array.isArray(data.indices) ? data.indices : null);
      setRankings(Array.isArray(data.rankings) ? data.rankings : []);
    } catch {
      if (selectionRequestRef.current !== controller || controller.signal.aborted) return;
      setError("Could not rank evidence. Check your connection and try again.");
    } finally {
      if (selectionRequestRef.current === controller) {
        selectionRequestRef.current = null;
        setSelectionLoading(false);
      }
    }
  }

  function cancelSelectionRequest() {
    if (!selectionRequestRef.current) return;
    selectionRequestRef.current.abort();
    selectionRequestRef.current = null;
    setSelectionLoading(false);
  }

  function getFinalIndices() {
    if (enableManualSelection && profile) {
      const selection = clampManualSelection(manualSelection, profile);
      const projectCount = profile?.projects?.length || 0;
      return [
        ...selection.projects.map((idx) => idx),
        ...selection.experiences.map((idx) => idx + projectCount),
      ];
    }

    if (enableManualSelection) return [];

    if (shouldSelect && indices && indices.length > 0) {
      return indices;
    }

    return null;
  }

  async function prepareGuidance(kind: "cover-letter" | "employer-question") {
    if (guidanceRequestRef.current || preparingGuidance || loading || questionLoading || selectionLoading) return;
    const signature = guidanceSignature;
    setGuidance(null);
    setGuidanceNotice(null);
    (kind === "cover-letter" ? setError : setQuestionError)(null);
    setPreparingGuidance(kind);
    const controller = new AbortController();
    guidanceRequestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(buildApiUrl("/api/generate/clarifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          company,
          jobDescription,
          question: kind === "employer-question" ? employerQuestion : undefined,
          answerStyle,
          idealWordCount,
          indices: getFinalIndices(),
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (guidanceRequestRef.current !== controller) return;
      if (signature !== guidanceSignatureRef.current) {
        (kind === "cover-letter" ? setError : setQuestionError)("Your inputs changed while preparing questions. Please generate again.");
        return;
      }
      if (!response.ok) {
        (kind === "cover-letter" ? setError : setQuestionError)(typeof data.error === "string" ? data.error : "Could not prepare questions. Please try again.");
        return;
      }
      const questions = sanitizeClarificationQuestions(data.questions);
      if (questions.length >= 2) setGuidance({ kind, signature, questions });
      else {
        guidanceRequestRef.current = null;
        setPreparingGuidance(null);
        window.clearTimeout(timeout);
        if (data.unavailable) setGuidanceNotice({ kind, message: "Optional questions are unavailable. Generating without them." });
        if (kind === "cover-letter") await generate([]);
        else await answerEmployerQuestion([]);
      }
    } catch {
      if (guidanceRequestRef.current !== controller) return;
      if (signature !== guidanceSignatureRef.current) {
        (kind === "cover-letter" ? setError : setQuestionError)("Your inputs changed while preparing questions. Please generate again.");
      } else {
        guidanceRequestRef.current = null;
        setPreparingGuidance(null);
        window.clearTimeout(timeout);
        setGuidanceNotice({ kind, message: "Optional questions are unavailable. Generating without them." });
        if (kind === "cover-letter") await generate([]);
        else await answerEmployerQuestion([]);
      }
    } finally {
      window.clearTimeout(timeout);
      if (guidanceRequestRef.current === controller) {
        guidanceRequestRef.current = null;
        setPreparingGuidance(null);
      }
    }
  }

  function skipPreparingGuidance() {
    if (!preparingGuidance || !guidanceRequestRef.current) return;
    guidanceRequestRef.current.abort();
    guidanceRequestRef.current = null;
    const kind = preparingGuidance;
    setPreparingGuidance(null);
    setGuidanceNotice({ kind, message: "Generating without optional questions." });
    if (kind === "cover-letter") void generate([]);
    else void answerEmployerQuestion([]);
  }

  function submitGuidance(answers: ClarificationAnswer[]) {
    if (!guidance) return;
    if (guidance.signature !== guidanceSignatureRef.current) {
      (guidance.kind === "cover-letter" ? setError : setQuestionError)("Your inputs changed. Please generate again for updated questions.");
      setGuidance(null);
      return;
    }
    const kind = guidance.kind;
    setGuidance(null);
    if (kind === "cover-letter") void generate(answers);
    else void answerEmployerQuestion(answers);
  }

  async function generate(clarificationAnswers: ClarificationAnswer[] = []) {
    if (selectionLoading) return;
    const usableManualSelection = profile ? clampManualSelection(manualSelection, profile) : { projects: [], experiences: [] };
    if (enableManualSelection && (!profile || usableManualSelection.projects.length + usableManualSelection.experiences.length === 0)) {
      setError(profile
        ? "Your saved evidence selection is no longer available. Choose at least one current project or experience, or turn off manual curation."
        : "Your profile evidence is unavailable. Wait for it to load, or turn off manual curation to use all available evidence.");
      return;
    }
    setLoading(true);
    setResult("");
    setLetterReviewWarning("");
    setAdvancedTrace(null);
    setError(null);
    const submittedSignature = guidanceSignatureRef.current;
    try {
      const finalIndices = getFinalIndices();
      const res = await fetch(buildApiUrl("/api/generate/cover-letter"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, jobDescription, indices: finalIndices, advancedMode, clarificationAnswers }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to generate");
        return;
      }

      setResult(typeof data.coverLetter === "string" ? data.coverLetter : "");
      setLetterReviewWarning([typeof data.reviewWarning === "string" ? data.reviewWarning : "", submittedSignature !== guidanceSignatureRef.current ? "Your inputs changed while this draft was being generated; it uses the earlier inputs." : ""].filter(Boolean).join(" "));
      setAdvancedTrace(normalizeTrace(data.advancedTrace));
      if (Array.isArray(data.indices) && !enableManualSelection) {
        setIndices(data.indices.filter((value: unknown): value is number => Number.isInteger(value)));
      }
    } catch {
      setError("Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function answerEmployerQuestion(clarificationAnswers: ClarificationAnswer[] = []) {
    if (selectionLoading) return;
    if (!employerQuestion.trim()) return;
    const usableManualSelection = profile ? clampManualSelection(manualSelection, profile) : { projects: [], experiences: [] };
    if (enableManualSelection && (!profile || usableManualSelection.projects.length + usableManualSelection.experiences.length === 0)) {
      setQuestionError(profile
        ? "Your saved evidence selection is no longer available. Choose at least one current project or experience, or turn off manual curation."
        : "Your profile evidence is unavailable. Wait for it to load, or turn off manual curation to use all available evidence.");
      return;
    }

    setQuestionLoading(true);
    setEmployerQuestionResult("");
    setAnswerReviewWarning("");
    setQuestionAdvancedTrace(null);
    setQuestionError(null);
    const submittedSignature = guidanceSignatureRef.current;
    try {
      const finalIndices = getFinalIndices();
      const res = await fetch(buildApiUrl("/api/generate/employer-question"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          jobDescription,
          question: employerQuestion,
          idealWordCount,
          answerStyle,
          indices: finalIndices,
          advancedMode,
          clarificationAnswers,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuestionError(typeof data.error === "string" ? data.error : "Failed to answer employer question");
        return;
      }

      setEmployerQuestionResult(typeof data.answer === "string" ? data.answer : "");
      setAnswerReviewWarning([typeof data.reviewWarning === "string" ? data.reviewWarning : "", submittedSignature !== guidanceSignatureRef.current ? "Your inputs changed while this draft was being generated; it uses the earlier inputs." : ""].filter(Boolean).join(" "));
      setQuestionAdvancedTrace(normalizeTrace(data.advancedTrace));
      if (Array.isArray(data.indices) && !enableManualSelection) {
        setIndices(data.indices.filter((value: unknown): value is number => Number.isInteger(value)));
      }
    } catch {
      setQuestionError("Failed to answer employer question");
    } finally {
      setQuestionLoading(false);
    }
  }

  async function exportPdf() {
    if (!result.trim()) return;

    setExportingPdf(true);
    setError(null);

    try {
      const res = await fetch(buildApiUrl("/api/generate/cover-letter/pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, coverLetter: result }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export PDF");
      }

      const blob = await res.blob();
      if (!blob.size) {
        throw new Error("Exported PDF is empty");
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(company || "cover-letter").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cover-letter"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied to clipboard.`);
    } catch {
      setCopyStatus("Clipboard access was blocked. Select and copy the text manually.");
    }
  }

  function toggleProject(index: number) {
    setManualSelection((current) => ({
      ...current,
      projects: current.projects.includes(index)
        ? current.projects.filter((item) => item !== index)
        : [...current.projects, index],
    }));
  }

  function toggleExperience(index: number) {
    setManualSelection((current) => ({
      ...current,
      experiences: current.experiences.includes(index)
        ? current.experiences.filter((item) => item !== index)
        : [...current.experiences, index],
    }));
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(buildApiUrl("/api/profile"));
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      }
    })().catch(() => setProfile(null)).finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => () => { selectionRequestRef.current?.abort(); guidanceRequestRef.current?.abort(); guidanceRequestRef.current = null; }, []);

  useEffect(() => {
    if (!draftHydrated || !profile) return;
    setManualSelection((current) => clampManualSelection(current, profile));
  }, [draftHydrated, profile]);

  useEffect(() => {
    const draft = loadSavedDraft();
    if (!draft) {
      setDraftHydrated(true);
      return;
    }

    setCompany(draft.company);
    setJobDescription(draft.jobDescription);
    setEmployerQuestion(draft.employerQuestion);
    setIdealWordCount(draft.idealWordCount);
    setAnswerStyle(draft.answerStyle);
    setShouldSelect(draft.shouldSelect);
    setAdvancedMode(draft.advancedMode);
    setIndices(draft.indices);
    setRankings(draft.rankings);
    setResult(draft.result);
    setEmployerQuestionResult(draft.employerQuestionResult);
    setAdvancedTrace(draft.advancedTrace);
    setQuestionAdvancedTrace(draft.questionAdvancedTrace);
    setLetterReviewWarning(draft.letterReviewWarning || "");
    setAnswerReviewWarning(draft.answerReviewWarning || "");
    setManualSelection(draft.manualSelection);
    setEnableManualSelection(draft.enableManualSelection);
    setShowManualEvidence(draft.showManualEvidence);
    previousDraftRef.current = {
      jobDescription: draft.jobDescription,
      shouldSelect: draft.shouldSelect,
    };
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    const previous = previousDraftRef.current;
    const jobChanged = jobDescription !== previous.jobDescription;
    const selectionEnabled = shouldSelect && !previous.shouldSelect;

    if ((jobChanged || selectionEnabled) && shouldSelect && jobDescription.trim()) {
      setIndices(null);
      setRankings([]);
      setAdvancedTrace(null);
      setQuestionAdvancedTrace(null);
    }

    previousDraftRef.current = {
      jobDescription,
      shouldSelect,
    };
  }, [jobDescription, shouldSelect]);

  useEffect(() => {
    if (!draftHydrated) return;

    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          company,
          jobDescription,
          employerQuestion,
          idealWordCount,
          answerStyle,
          shouldSelect,
          advancedMode,
          indices,
          rankings,
          result,
          employerQuestionResult,
          advancedTrace,
          questionAdvancedTrace,
          letterReviewWarning,
          answerReviewWarning,
          manualSelection,
          enableManualSelection,
          showManualEvidence,
        } satisfies SavedDraft),
      );
    } catch {
      // Ignore storage failures so the page still works in restricted browser contexts.
    }
  }, [
    company,
    jobDescription,
    employerQuestion,
    idealWordCount,
    answerStyle,
    shouldSelect,
    advancedMode,
    indices,
    rankings,
    result,
    employerQuestionResult,
    advancedTrace,
    questionAdvancedTrace,
    letterReviewWarning,
    answerReviewWarning,
    manualSelection,
    enableManualSelection,
    showManualEvidence,
    draftHydrated,
  ]);

  useEffect(() => {
    if (!draftHydrated || disclosureReadyRef.current) return;
    disclosureReadyRef.current = true;
    if (enableManualSelection || !shouldSelect) setEvidenceOpen(true);
    if (advancedMode) setAdvancedOpen(true);
    if (employerQuestion.trim() || employerQuestionResult) setEmployerOpen(true);
    if (idealWordCount || answerStyle) {
      setEmployerOpen(true);
      setAnswerOptionsOpen(true);
    }
  }, [advancedMode, answerStyle, draftHydrated, employerQuestion, employerQuestionResult, enableManualSelection, idealWordCount, shouldSelect]);

  useEffect(() => {
    if (questionError || preparingGuidance === "employer-question" || guidance?.kind === "employer-question") {
      setEmployerOpen(true);
    }
  }, [guidance, preparingGuidance, questionError]);

  useEffect(() => {
    if (!draftHydrated) return;
    const signature = rankings.map((item) => `${item.type}:${item.index}:${item.justification}`).join("|");
    if (rankingsSignatureRef.current === null) {
      rankingsSignatureRef.current = signature;
      return;
    }
    if (signature === rankingsSignatureRef.current) return;
    rankingsSignatureRef.current = signature;
    if (!signature) return;
    setEvidenceOpen(true);
    setRankingsOpen(true);
  }, [draftHydrated, rankings]);

  useEffect(() => {
    if (preparingGuidance === "cover-letter") scrollToSection("generated-letter");
  }, [preparingGuidance]);

  useEffect(() => {
    if (guidance?.kind === "cover-letter") scrollToSection("cover-letter-guidance");
  }, [guidance]);

  useEffect(() => {
    if (loading) scrollToSection("generated-letter");
  }, [loading]);

  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    scrollToSection(id);
  }, [evidenceOpen, employerOpen]);

  const currentManualSelection = useMemo(
    () => (profile ? clampManualSelection(manualSelection, profile) : { projects: [], experiences: [] }),
    [manualSelection, profile],
  );
  const manualEvidenceCount = currentManualSelection.projects.length + currentManualSelection.experiences.length;

  const evidenceCount = useMemo(() => {
    if (advancedTrace?.finalEvidenceCount) return advancedTrace.finalEvidenceCount;
    if (enableManualSelection) {
      return manualEvidenceCount;
    }
    return indices?.length || 0;
  }, [advancedTrace?.finalEvidenceCount, enableManualSelection, indices, manualEvidenceCount]);

  const evidenceMode = advancedMode
    ? "Advanced agent loop"
    : enableManualSelection
      ? "Manual curation"
      : shouldSelect
        ? "AI Coaching"
        : "Open generation";
  const manualBlocked = enableManualSelection && (profileLoading || !profile || manualEvidenceCount === 0);
  const sharedBusy = loading || questionLoading || !!preparingGuidance || !!guidance || selectionLoading;
  const generateBlocked = sharedBusy || !company.trim() || !jobDescription.trim() || manualBlocked;
  const answerBlocked = sharedBusy || !employerQuestion.trim() || manualBlocked;
  const coachingBlocked = sharedBusy || !jobDescription.trim();
  const letterNotice = copyStatus.startsWith("Cover letter") || copyStatus.startsWith("Clipboard") ? copyStatus : "";
  const answerNotice = copyStatus.startsWith("Employer answer") || copyStatus.startsWith("Clipboard") ? copyStatus : "";
  const evidenceMeta = `${enableManualSelection ? "Manual" : shouldSelect ? "AI Coaching" : "Open"} · ${evidenceCount}`;

  let barHint = "Add a company and job description";
  let barLabel = "Generate";
  let barDisabled = generateBlocked;
  let barAction = () => {
    void prepareGuidance("cover-letter");
  };
  if (preparingGuidance === "cover-letter") {
    barHint = "Choosing the few decisions that will change this letter…";
    barLabel = "Skip";
    barDisabled = false;
    barAction = skipPreparingGuidance;
  } else if (guidance?.kind === "cover-letter") {
    barHint = "Optional decisions are ready";
    barLabel = "Review";
    barDisabled = false;
    barAction = () => scrollToSection("cover-letter-guidance");
  } else if (loading) {
    barHint = advancedMode ? "Running advanced cover letter agent..." : "Generating cover letter...";
    barLabel = "Generating…";
    barDisabled = true;
  } else if (preparingGuidance === "employer-question" || questionLoading) {
    barHint = questionLoading
      ? advancedMode
        ? "Running advanced answer agent..."
        : "Answering employer question..."
      : "Choosing the few decisions that will change this answer…";
  } else if (selectionLoading) {
    barHint = "Ranking evidence…";
  } else if (manualBlocked) {
    barHint = profileLoading ? "Loading your evidence…" : !profile ? "Profile evidence is unavailable" : "Select at least one item";
  } else if (!company.trim() || !jobDescription.trim()) {
    barHint = "Add a company and job description";
  } else if (guidance?.kind === "employer-question") {
    barHint = "Employer decisions are open";
  } else if (error) {
    barHint = "Check the message above";
  } else {
    barHint = "Ready to generate";
  }

  function selectStep(id: string) {
    const openingEvidence = id === "evidence-selection" && !evidenceOpen;
    const openingEmployer = id === "employer-question" && !employerOpen;
    if (id === "evidence-selection") setEvidenceOpen(true);
    if (id === "employer-question") setEmployerOpen(true);
    if (openingEvidence || openingEmployer) {
      pendingScrollRef.current = id;
      return;
    }
    scrollToSection(id);
  }

  return (
    <ModuleShell
      compactMobile
      eyebrow="Cover Letter Module"
      title="Build a cover letter around evidence, not generic claims."
      description="Use job context, AI selection, manual curation, and advanced evidence planning so the final letter sounds targeted and credible."
      stats={[
        { label: "Mode", value: enableManualSelection ? "Manual" : shouldSelect ? "AI" : "Open" },
        { label: "Evidence", value: `${evidenceCount}` },
        { label: "Stage", value: advancedMode ? "Advanced" : result ? "Ready" : "Draft" },
      ]}
      aside={
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="section-kicker">Letter Strategy</p>
            <h2 className="text-foreground font-display text-3xl">Narrative with proof</h2>
            <p className="text-muted-foreground text-sm leading-7">
              The strongest letters map job requirements to credible evidence, then close any gaps with truthful adjacent experience.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Frame why this company matters to you",
              "Select evidence that maps to role requirements",
              "Use Advanced Mode when the JD has many must-have signals",
            ].map((item) => (
              <div key={item} className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
                <span className="status-dot" />
                <span className="text-foreground min-w-0 break-words text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {error ? (
        <div id="generate-error" role="alert" className="scroll-mt-24">
          <GlassPanel className="border-destructive/40 p-4">
            <p className="text-destructive break-words text-sm leading-6">{error}</p>
          </GlassPanel>
        </div>
      ) : null}
      <div className="min-w-0 pb-24 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:pb-0">
        <SectionNavigator steps={GENERATE_STEPS} onSelect={selectStep} />

        <div className="mt-4 min-w-0 space-y-4 lg:mt-0">
          <section id="job-brief" aria-label="Job brief" className="min-w-0 scroll-mt-40 lg:scroll-mt-24">
            <GlassPanel className="p-4 sm:p-6">
              <SectionHeading
                eyebrow="Job brief"
                title="Company and role"
                description="Start here. The company and job description set the letter."
              />

              <div className="mt-4 space-y-4">
                <label className="block min-w-0 space-y-2">
                  <span className="text-foreground text-sm font-medium">Company name</span>
                  <input
                    className={FIELD_CLASS}
                    placeholder="Google, Canva, Atlassian..."
                    maxLength={300}
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </label>

                <label className="block min-w-0 space-y-2">
                  <span className="text-foreground text-sm font-medium">Job description</span>
                  <textarea
                    className={`${FIELD_CLASS} min-h-36 resize-y sm:min-h-48`}
                    placeholder="Paste the description here so the system can match requirements, responsibilities, and tone."
                    maxLength={18000}
                    value={jobDescription}
                    onChange={(event) => {
                      cancelSelectionRequest();
                      setJobDescription(event.target.value);
                    }}
                  />
                </label>
              </div>
            </GlassPanel>
          </section>

          <section id="evidence-selection" aria-label="Evidence" className="min-w-0 scroll-mt-40 lg:scroll-mt-24">
            <GlassPanel className="p-4 sm:p-6">
              <DisclosureSection
                open={evidenceOpen}
                onToggle={() => setEvidenceOpen((current) => !current)}
                kicker="Evidence"
                title="What the letter can cite"
                meta={evidenceMeta}
              >
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-6">
                    Use AI Coaching for speed, or hand-pick the evidence you want included. Advanced Mode can then inspect and expand the evidence set.
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <ChoiceRow
                      checked={shouldSelect}
                      onChange={(checked) => {
                        cancelSelectionRequest();
                        setShouldSelect(checked);
                      }}
                      title="AI Coaching"
                      description="Rank the strongest projects and experiences against the job brief, with concise relevance rationale."
                    />
                    <ChoiceRow
                      checked={enableManualSelection}
                      onChange={(checked) => {
                        cancelSelectionRequest();
                        setEnableManualSelection(checked);
                        if (checked) {
                          setShowManualEvidence(true);
                        } else {
                          setManualSelection({ projects: [], experiences: [] });
                          setShowManualEvidence(true);
                        }
                      }}
                      title="Curate manually"
                      description="Pick the exact projects and experiences that should be woven into the letter."
                    />
                  </div>

                  {shouldSelect ? (
                    <button
                      type="button"
                      onClick={selectRelevant}
                      disabled={coachingBlocked}
                      className={`button-secondary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${ACTION_CLASS}`}
                    >
                      {selectionLoading ? "Ranking evidence…" : "Run AI Coaching"}
                    </button>
                  ) : null}

                  {selectionLoading ? (
                    <p role="status" className="text-muted-foreground text-sm">Ranking your profile evidence against this role…</p>
                  ) : null}

                  {enableManualSelection && shouldSelect ? (
                    <p className="text-muted-foreground text-sm leading-6">Manual curation is what the draft will use while it is on.</p>
                  ) : null}

                  {enableManualSelection ? (
                    <div className="space-y-4">
                      {profileLoading ? (
                        <p role="status" className="text-muted-foreground text-sm">Loading your profile evidence…</p>
                      ) : !profile ? (
                        <p role="status" className="text-muted-foreground text-sm">Profile evidence could not be loaded. Refresh the page or turn off manual curation to continue.</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowManualEvidence((current) => !current)}
                        className={`button-secondary min-h-11 w-full sm:w-auto ${ACTION_CLASS}`}
                      >
                        {showManualEvidence ? "Hide evidence" : "Show evidence"}
                      </button>

                      {showManualEvidence && profile ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="min-w-0 space-y-2">
                            <div className="flex items-baseline justify-between gap-3">
                              <h3 className="text-foreground text-sm font-semibold">Experiences</h3>
                              <p className="text-muted-foreground text-xs">{currentManualSelection.experiences.length} selected</p>
                            </div>
                            {profile.experiences?.length ? (
                              profile.experiences.map((experience, idx) => (
                                <SelectableRow
                                  key={`${experience.companyName}-${experience.role}-${idx}`}
                                  checked={manualSelection.experiences.includes(idx)}
                                  onChange={() => toggleExperience(idx)}
                                  title={`${experience.companyName} · ${experience.role}`}
                                  detail={experience.summary}
                                />
                              ))
                            ) : (
                              <p className="text-muted-foreground text-xs">No experiences added yet.</p>
                            )}
                          </div>

                          <div className="min-w-0 space-y-2">
                            <div className="flex items-baseline justify-between gap-3">
                              <h3 className="text-foreground text-sm font-semibold">Projects</h3>
                              <p className="text-muted-foreground text-xs">{currentManualSelection.projects.length} selected</p>
                            </div>
                            {profile.projects?.length ? (
                              profile.projects.map((project, idx) => (
                                <SelectableRow
                                  key={`${project.name}-${idx}`}
                                  checked={manualSelection.projects.includes(idx)}
                                  onChange={() => toggleProject(idx)}
                                  title={project.name || "Untitled Project"}
                                  detail={project.summary}
                                />
                              ))
                            ) : (
                              <p className="text-muted-foreground text-xs">No projects added yet.</p>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {!profileLoading && profile && manualEvidenceCount === 0 ? (
                        <p className="text-muted-foreground text-sm" role="status">Select at least one item to use manual curation.</p>
                      ) : null}
                    </div>
                  ) : null}

                  {shouldSelect && rankings.length > 0 ? (
                    <DetailsToggle
                      label={`AI Coaching results · ${rankings.length} items`}
                      open={rankingsOpen}
                      onToggle={() => setRankingsOpen((current) => !current)}
                    >
                      <StaggerGroup className="space-y-2">
                        {rankings.map((item, index) => (
                          <StaggerItem key={`${item.type}-${item.index}`}>
                            <div className="surface-subtle flex min-w-0 items-start gap-3 rounded-2xl p-3">
                              <span className="status-dot mt-2 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-foreground break-words text-sm font-medium">{item.title}</div>
                                  <span className="text-muted-foreground text-[11px] uppercase tracking-[0.2em]">{index + 1}</span>
                                </div>
                                <div className="text-muted-foreground mt-1 text-[11px] uppercase tracking-[0.2em]">{item.type}</div>
                                <div className="text-muted-foreground mt-2 break-words text-xs leading-6">{item.justification}</div>
                              </div>
                            </div>
                          </StaggerItem>
                        ))}
                      </StaggerGroup>
                    </DetailsToggle>
                  ) : null}

                  <DetailsToggle label="How evidence is used">
                    <div className="space-y-3">
                      <div className="surface-subtle flex items-start justify-between gap-3 rounded-2xl px-4 py-3">
                        <span className="text-muted-foreground shrink-0 text-sm">Mode</span>
                        <span className="text-foreground min-w-0 break-words text-right text-sm font-medium">{evidenceMode}</span>
                      </div>
                      <div className="surface-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                        <span className="text-muted-foreground text-sm">Evidence count</span>
                        <span className="text-foreground text-sm font-medium">{evidenceCount}</span>
                      </div>
                      <div className="surface-subtle rounded-2xl px-4 py-4">
                        <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Recommendation</p>
                        <p className="text-muted-foreground mt-2 break-words text-sm leading-7">
                          Keep the letter anchored to a few strong proof points. Turn on Advanced Mode when you want the system to check missing JD skills, tools, qualifications, and qualities before drafting.
                        </p>
                      </div>
                    </div>
                  </DetailsToggle>
                </div>
              </DisclosureSection>
            </GlassPanel>
          </section>

          <section id="generated-letter" aria-label="Generated letter" className="min-w-0 scroll-mt-40 lg:scroll-mt-24">
            <GlassPanel className="p-4 sm:p-6">
              <SectionHeading
                eyebrow="Letter"
                title="Generated letter"
                description="The draft shows up here, ready to copy or export."
              />

              <p aria-live="polite" className="sr-only">{copyStatus}</p>
              <div className="mt-4 min-w-0 space-y-4">
                <DetailsToggle
                  label={`Advanced mode · ${advancedMode ? "On" : "Off"}`}
                  open={advancedOpen}
                  onToggle={() => setAdvancedOpen((current) => !current)}
                >
                  <ChoiceRow
                    checked={advancedMode}
                    onChange={setAdvancedMode}
                    title="Advanced Mode"
                    description="Run planner, evidence-retrieval, synthesis, and reviewer loops before writing the final answer."
                  />
                </DetailsToggle>

                {guidance?.kind === "cover-letter" ? (
                  <div id="cover-letter-guidance" className="scroll-mt-40 lg:scroll-mt-24">
                    <ClarificationQuestions key={guidance.signature} questions={guidance.questions} onSubmit={submitGuidance} onCancel={() => setGuidance(null)} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void prepareGuidance("cover-letter")}
                    disabled={generateBlocked}
                    className={`button-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_CLASS}`}
                  >
                    {preparingGuidance === "cover-letter"
                      ? "Preparing optional questions…"
                      : loading
                        ? advancedMode
                          ? "Running advanced cover letter agent..."
                          : "Generating cover letter..."
                        : "Generate Cover Letter"}
                  </button>
                )}
                {preparingGuidance === "cover-letter" ? (
                  <div className="space-y-2">
                    <p role="status" className="text-muted-foreground text-sm">Choosing the few decisions that will change this letter…</p>
                    <button type="button" className={`button-secondary min-h-11 w-full ${ACTION_CLASS}`} onClick={skipPreparingGuidance}>
                      Skip decisions and generate
                    </button>
                  </div>
                ) : null}
                {guidanceNotice?.kind === "cover-letter" ? <p role="status" className="text-muted-foreground text-sm">{guidanceNotice.message}</p> : null}

                <ResultBlock
                  loading={loading}
                  loadingLabel={advancedMode ? "Running advanced cover letter agent..." : "Generating cover letter..."}
                  text={result}
                  warning={letterReviewWarning}
                  emptyTitle="Your cover letter draft will appear here."
                  emptyDescription="Add the role context, pick evidence, and generate when ready."
                  maxHeightClass="max-h-[34rem]"
                  notice={letterNotice}
                  actions={
                    <>
                      <button type="button" onClick={() => void copyText(result, "Cover letter")} className={`button-secondary min-h-11 w-full flex-1 sm:w-auto ${ACTION_CLASS}`}>
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={exportPdf}
                        disabled={exportingPdf}
                        className={`button-secondary min-h-11 w-full flex-1 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${ACTION_CLASS}`}
                      >
                        {exportingPdf ? "Exporting PDF..." : "Export PDF"}
                      </button>
                      <button type="button" onClick={() => setResult("")} className={`button-secondary min-h-11 w-full flex-1 sm:w-auto ${ACTION_CLASS}`}>
                        Clear
                      </button>
                    </>
                  }
                />

                {advancedTrace ? (
                  <DetailsToggle label="Advanced planner trace">
                    <TracePanel trace={advancedTrace} title="Advanced planner trace" />
                  </DetailsToggle>
                ) : null}
              </div>
            </GlassPanel>
          </section>

          <section id="employer-question" aria-label="Employer answer" className="min-w-0 scroll-mt-40 lg:scroll-mt-24">
            <GlassPanel className="p-4 sm:p-6">
              <DisclosureSection
                open={employerOpen}
                onToggle={() => setEmployerOpen((current) => !current)}
                kicker="Optional"
                title="Employer answer"
                meta={employerQuestionResult ? "Ready" : employerQuestion.trim() ? "Started" : "Optional"}
              >
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-6">
                    Use the same evidence selection and Advanced Mode setting, then add the employer&apos;s question, a target length, and a preferred answer style.
                  </p>
                  <label className="block min-w-0 space-y-2">
                    <span className="text-foreground text-sm font-medium">Employer question</span>
                    <textarea
                      className={`${FIELD_CLASS} min-h-28 resize-y`}
                      placeholder="Paste the employer's question here."
                      maxLength={4000}
                      value={employerQuestion}
                      onChange={(event) => setEmployerQuestion(event.target.value)}
                    />
                  </label>

                  <DetailsToggle
                    label="Length and style"
                    open={answerOptionsOpen}
                    onToggle={() => setAnswerOptionsOpen((current) => !current)}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block min-w-0 space-y-2">
                        <span className="text-foreground text-sm font-medium">Ideal Word Count (optional)</span>
                        <input
                          className={FIELD_CLASS}
                          placeholder="e.g. 120"
                          value={idealWordCount}
                          onChange={(event) => setIdealWordCount(event.target.value)}
                        />
                      </label>
                      <label className="block min-w-0 space-y-2">
                        <span className="text-foreground text-sm font-medium">Answer Style (optional)</span>
                        <input
                          className={FIELD_CLASS}
                          placeholder="e.g. concise, direct, confident"
                          value={answerStyle}
                          onChange={(event) => setAnswerStyle(event.target.value)}
                        />
                      </label>
                    </div>
                  </DetailsToggle>

                  {questionError ? (
                    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3">
                      <p className="text-destructive break-words text-sm leading-6">{questionError}</p>
                    </div>
                  ) : null}

                  {guidance?.kind === "employer-question" ? (
                    <ClarificationQuestions key={guidance.signature} questions={guidance.questions} onSubmit={submitGuidance} onCancel={() => setGuidance(null)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void prepareGuidance("employer-question")}
                      disabled={answerBlocked}
                      className={`button-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_CLASS}`}
                    >
                      {preparingGuidance === "employer-question"
                        ? "Preparing optional questions…"
                        : questionLoading
                          ? advancedMode
                            ? "Running advanced answer agent..."
                            : "Answering employer question..."
                          : "Generate Employer Answer"}
                    </button>
                  )}
                  {preparingGuidance === "employer-question" ? (
                    <div className="space-y-2">
                      <p role="status" className="text-muted-foreground text-sm">Choosing the few decisions that will change this answer…</p>
                      <button type="button" className={`button-secondary min-h-11 w-full ${ACTION_CLASS}`} onClick={skipPreparingGuidance}>
                        Skip decisions and generate
                      </button>
                    </div>
                  ) : null}
                  {guidanceNotice?.kind === "employer-question" ? <p role="status" className="text-muted-foreground text-sm">{guidanceNotice.message}</p> : null}

                  <ResultBlock
                    loading={questionLoading}
                    loadingLabel={advancedMode ? "Running advanced answer agent..." : "Answering employer question..."}
                    text={employerQuestionResult}
                    warning={answerReviewWarning}
                    emptyTitle="Your employer-question answer will appear here."
                    emptyDescription="Add the question, choose an optional style, and generate when ready."
                    maxHeightClass="max-h-[22rem]"
                    notice={answerNotice}
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => void copyText(employerQuestionResult, "Employer answer")}
                          className={`button-secondary min-h-11 w-full flex-1 sm:w-auto ${ACTION_CLASS}`}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmployerQuestionResult("")}
                          className={`button-secondary min-h-11 w-full flex-1 sm:w-auto ${ACTION_CLASS}`}
                        >
                          Clear
                        </button>
                      </>
                    }
                  />

                  {questionAdvancedTrace ? (
                    <DetailsToggle label="Advanced answer trace">
                      <TracePanel trace={questionAdvancedTrace} title="Advanced answer trace" />
                    </DetailsToggle>
                  ) : null}
                </div>
              </DisclosureSection>
            </GlassPanel>
          </section>
        </div>
      </div>

      <MobileGenerateBar hint={barHint} label={barLabel} disabled={barDisabled} onClick={barAction} />
    </ModuleShell>
  );
}
