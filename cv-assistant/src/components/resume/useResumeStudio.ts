"use client";

import { useEffect, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import { STYLE_OPTIONS } from "@/components/resume/style-options";
import { MAX_RESUME_ITEMS, MIN_JOB_DESCRIPTION_WORDS } from "@/lib/resume/constants";
import type {
  AccentColor,
  CoachMessage,
  CoachingAgent,
  ContentSelection,
  FontSize,
  Profile,
  StyleId,
  StylePreferences,
} from "@/components/resume/types";

function parseStylingPreferences(messages: CoachMessage[]): StylePreferences {
  const userAnswers = messages.filter((message) => message.role === "user").map((message) => message.content.toLowerCase());

  let fontSize = "11pt";
  let useBold = false;
  let useItalic = false;
  const contentDensity = "balanced";

  if (userAnswers[0]) {
    if (userAnswers[0].includes("10pt") || userAnswers[0].includes("smaller")) {
      fontSize = "10pt";
    } else if (userAnswers[0].includes("12pt") || userAnswers[0].includes("larger")) {
      fontSize = "12pt";
    }
    if (userAnswers[0].includes("bold")) useBold = true;
    if (userAnswers[0].includes("italic")) useItalic = true;
  }

  return {
    fontSize,
    useBold,
    useItalic,
    boldSections: [],
    italicSections: [],
    contentDensity,
    additionalNotes: "Manually parsed preferences",
  };
}

export function useResumeStudio() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [skills, setSkills] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [selectedExperiences, setSelectedExperiences] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Generating PDF...");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [enhance, setEnhance] = useState(false);
  const [aiCoachingEnabled, setAiCoachingEnabled] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [stylingCustomization, setStylingCustomization] = useState(false);
  const [contentCustomization, setContentCustomization] = useState(false);
  const [stylingMessages, setStylingMessages] = useState<CoachMessage[]>([]);
  const [contentMessages, setContentMessages] = useState<CoachMessage[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const [currentAgent, setCurrentAgent] = useState<CoachingAgent | null>(null);
  const [contentSelectedItems, setContentSelectedItems] = useState<ContentSelection[]>([]);
  const [currentContentItem, setCurrentContentItem] = useState(0);
  const [contentEnhancementData, setContentEnhancementData] = useState<Record<string, string>>({});
  const [contentEnhancementStarted, setContentEnhancementStarted] = useState(false);
  const [stylePreferences, setStylePreferences] = useState<StylePreferences | null>(null);
  const [uiFontSize, setUiFontSize] = useState<FontSize>("11pt");
  const [uiUseBold, setUiUseBold] = useState(false);
  const [uiUseItalic, setUiUseItalic] = useState(false);
  const [uiAccentColor, setUiAccentColor] = useState<AccentColor>("black");
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [modalSelectedStyle, setModalSelectedStyle] = useState<StyleId | null>(null);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const generateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aiCoachingEnabled) return;
    if (contentCustomization) setContentCustomization(false);
    if (currentAgent === "content") {
      setCurrentAgent(null);
      setContentMessages([]);
      setContentSelectedItems([]);
      setCurrentContentItem(0);
      setContentEnhancementStarted(false);
    }
  }, [aiCoachingEnabled, contentCustomization, currentAgent]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 700);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isStyleModalOpen) return;
    setCurrentPreviewIndex(0);
    setModalSelectedStyle(null);
  }, [isStyleModalOpen]);

  useEffect(() => {
    let active = true;
    setProfileLoadError(null);
    setProfileMissing(false);
    (async () => {
      try {
        const res = await fetch(buildApiUrl("/api/profile"));
        if (!res.ok) throw new Error(`Profile request failed (${res.status}).`);
        const data = await res.json();
        if (!active) return;
        if (!data.profile) {
          setProfileMissing(true);
          return;
        }
        setProfile(data.profile);
        setSkills(data.profile.skills || "");
      } catch {
        if (active) setProfileLoadError("We couldn’t load your profile. Check your connection or sign-in, then try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, [profileLoadAttempt]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  function startStylingQuestions() {
    setStylingMessages([]);
  }

  function startContentQuestions() {
    setContentEnhancementStarted(false);
    setContentSelectedItems([]);
    setCurrentContentItem(0);
    setContentMessages([]);
  }

  function moveToNextContentItem() {
    if (currentContentItem + 1 < contentSelectedItems.length) {
      setCurrentContentItem(currentContentItem + 1);
      setContentMessages([]);
    } else {
      setCurrentContentItem(contentSelectedItems.length);
      setContentMessages([]);
    }
  }

  async function handleQuestionSubmit() {
    if (!coachInput.trim()) return;

    const currentMessages = currentAgent === "styling" ? stylingMessages : contentMessages;
    const newMessages = [...currentMessages, { role: "user" as const, content: coachInput.trim() }];

    if (currentAgent === "styling") {
      setStylingMessages(newMessages);

      if (newMessages.length >= 3) {
        const preferences = parseStylingPreferences(newMessages);
        setStylePreferences(preferences);
        setStylingMessages((messages) => [...messages, { role: "assistant", content: "Styling preferences set successfully! ✅" }]);

        if (contentCustomization) {
          setTimeout(() => {
            setCurrentAgent("content");
            startContentQuestions();
          }, 1500);
        }
      }
    } else if (currentAgent === "content") {
      setContentMessages(newMessages);

      if (newMessages.length >= 2) {
        try {
          const currentItem = contentSelectedItems[currentContentItem];
          if (!currentItem) return;

          let originalContent = "";
          let itemName = "";

          if (currentItem.type === "project") {
            const project = profile?.projects?.[currentItem.index];
            if (project) {
              originalContent = project.description || project.summary || "";
              itemName = project.name || "Untitled Project";
            }
          } else {
            const experience = profile?.experiences?.[currentItem.index];
            if (experience) {
              originalContent = experience.description || experience.summary || "";
              itemName = `${experience.companyName || "Company"} - ${experience.role || "Role"}`;
            }
          }

          if (!originalContent) {
            setContentMessages((messages) => [...messages, { role: "assistant", content: "⚠️ No content found for this item. Moving to next item..." }]);
            moveToNextContentItem();
            return;
          }

          setContentMessages((messages) => [...messages, { role: "assistant", content: "Processing your enhancement request..." }]);

          const enhancementResponse = await fetch(buildApiUrl("/api/resume/enhance-targeted"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemType: currentItem.type,
              itemName,
              originalContent,
              userPreferences: {
                format: newMessages[0].content,
                modifications: newMessages[1].content,
              },
            }),
          });

          if (enhancementResponse.ok) {
            const enhancementData = await enhancementResponse.json();
            let finalEnhancedContent: string = enhancementData.enhancedContent;
            const wantsEmphasis = !!(stylePreferences?.useBold || stylePreferences?.useItalic);
            if (wantsEmphasis) {
              try {
                const beautifyRes = await fetch(buildApiUrl("/api/resume/beautify"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: enhancementData.enhancedContent,
                    contentType: currentItem.type,
                    stylePreferences,
                  }),
                });
                if (beautifyRes.ok) {
                  const beautified = await beautifyRes.json();
                  if (beautified?.formattedContent) {
                    finalEnhancedContent = beautified.formattedContent;
                  }
                }
              } catch {
                console.warn("Beautify step failed, using raw enhanced content");
              }
            }

            const key = `${currentItem.type}-${currentItem.index}`;
            setContentEnhancementData((prev) => ({
              ...prev,
              [key]: finalEnhancedContent,
            }));

            setContentMessages((messages) => messages.filter((message) => !message.content.includes("Processing")));
            setContentMessages((messages) => [...messages, { role: "assistant", content: `✅ Enhanced content for &quot;${itemName}&quot;!` }]);

            setTimeout(() => {
              moveToNextContentItem();
            }, 1000);
          } else {
            throw new Error("Failed to enhance content");
          }
        } catch (enhancementError) {
          console.error("Content enhancement failed:", enhancementError);
          setContentMessages((messages) => messages.filter((message) => !message.content.includes("Processing")));
          setContentMessages((messages) => [...messages, { role: "assistant", content: "⚠️ Enhancement failed. Moving to next item..." }]);
          setTimeout(() => {
            moveToNextContentItem();
          }, 1000);
        }
      }
    }

    setCoachInput("");
  }

  function isAllCoachingComplete() {
    if (!stylingCustomization && !contentCustomization) return true;
    if (stylingCustomization && !stylePreferences) return false;
    if (contentCustomization) {
      if (currentAgent === "content") {
        if (contentSelectedItems.length === 0 || !contentEnhancementStarted) return false;
        return currentContentItem >= contentSelectedItems.length;
      }
      if (contentSelectedItems.length === 0 || !contentEnhancementStarted) return false;
      if (currentContentItem < contentSelectedItems.length) return false;
    }
    return true;
  }

  const totalSelected = selectedProjects.length + selectedExperiences.length;
  const limitReached = !aiCoachingEnabled && totalSelected > MAX_RESUME_ITEMS;
  const jobDescriptionWordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).filter(Boolean).length : 0;
  const aiCoachingInputError = !aiCoachingEnabled
    ? null
    : !jobDescription.trim()
      ? "Job description is required when AI Coaching is enabled."
      : jobDescriptionWordCount < MIN_JOB_DESCRIPTION_WORDS
        ? `Job description is too short. Please add at least ${MIN_JOB_DESCRIPTION_WORDS} words so AI Coaching has enough context.`
        : null;
  const coachingComplete = isAllCoachingComplete();
  const generationBlockedReason = !coachingComplete
    ? "Please complete your AI coaching session first, or click Reset to cancel"
    : aiCoachingInputError;

  function toggle(index: number, list: number[], setList: (value: number[]) => void) {
    if (aiCoachingEnabled) return;
    setList(list.includes(index) ? list.filter((item) => item !== index) : [...list, index]);
  }

  async function requestResumePreview(chosenStyle: StyleId) {
    if (!profile) return;
    if (limitReached) {
      setError(`You can include at most ${MAX_RESUME_ITEMS} items across projects and experiences.`);
      return;
    }
    if (aiCoachingInputError) {
      setError(aiCoachingInputError);
      return;
    }

    setLoading(true);
    setLoadingMessage(aiCoachingEnabled ? "Tailoring your resume…" : "Generating your PDF…");
    setError(null);
    setPdfUrl(null);

    try {
      const res = await fetch(buildApiUrl("/api/generate-resume"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedStyle: chosenStyle,
          skills,
          selectedProjects,
          selectedExperiences,
          enhance,
          qa: [...stylingMessages, ...contentMessages],
          stylePreferences,
          contentEnhancementData,
          ai_coaching_enabled: aiCoachingEnabled,
          job_description: jobDescription,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate PDF. Please try again.");
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Generated PDF is empty. Please check your selections and try again.");
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Could not generate the PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function closeStyleModal() {
    setIsStyleModalOpen(false);
    setModalSelectedStyle(null);
  }

  async function confirmStyle() {
    if (!modalSelectedStyle) return;
    const chosenStyle = modalSelectedStyle;
    setIsStyleModalOpen(false);
    setModalSelectedStyle(null);
    await requestResumePreview(chosenStyle);
  }

  function saveStylePreferences() {
    setStylePreferences({
      fontSize: uiFontSize,
      useBold: uiUseBold,
      useItalic: uiUseItalic,
      boldSections: [],
      italicSections: [],
      contentDensity: "balanced",
      additionalNotes: "Set via UI",
      accentColor: uiAccentColor,
    });
    if (contentCustomization) {
      setTimeout(() => {
        setCurrentAgent("content");
        startContentQuestions();
      }, 500);
    }
  }

  function startQuestions() {
    if (stylingCustomization) {
      setCurrentAgent("styling");
      startStylingQuestions();
    } else if (contentCustomization) {
      setCurrentAgent("content");
      startContentQuestions();
    }
  }

  function startEnhancing() {
    setContentEnhancementStarted(true);
    setCurrentContentItem(0);
    setContentMessages([]);
  }

  function resetCoaching() {
    setCurrentAgent(null);
    setStylingCustomization(false);
    setContentCustomization(false);
    setStylingMessages([]);
    setContentMessages([]);
    setContentSelectedItems([]);
    setCurrentContentItem(0);
    setContentEnhancementData({});
    setContentEnhancementStarted(false);
  }

  function toggleContentItem(item: ContentSelection, selected: boolean) {
    if (selected) {
      if (contentSelectedItems.length < 3) {
        setContentSelectedItems((prev) => [...prev, item]);
      }
      return;
    }
    setContentSelectedItems((prev) => prev.filter((entry) => !(entry.type === item.type && entry.index === item.index)));
  }

  return {
    profile,
    profileLoadError,
    profileMissing,
    retryProfile: () => setProfileLoadAttempt((attempt) => attempt + 1),
    skills,
    setSkills,
    selectedProjects,
    selectedExperiences,
    toggleProject: (index: number) => toggle(index, selectedProjects, setSelectedProjects),
    toggleExperience: (index: number) => toggle(index, selectedExperiences, setSelectedExperiences),
    totalSelected,
    limitReached,
    error,
    loading,
    loadingMessage,
    pdfUrl,
    resetPreview: () => setPdfUrl(null),
    enhance,
    setEnhance,
    aiCoachingEnabled,
    setAiCoachingEnabled,
    jobDescription,
    setJobDescription,
    aiCoachingInputError,
    coachingComplete,
    generationBlockedReason,
    generateDisabled: loading || limitReached || !coachingComplete || !!aiCoachingInputError,
    generateButtonRef,
    openStyleModal: () => setIsStyleModalOpen(true),
    isStyleModalOpen,
    closeStyleModal,
    confirmStyle,
    isMobile,
    currentPreviewIndex,
    nextPreview: () => setCurrentPreviewIndex((index) => (index + 1) % STYLE_OPTIONS.length),
    prevPreview: () => setCurrentPreviewIndex((index) => (index - 1 + STYLE_OPTIONS.length) % STYLE_OPTIONS.length),
    goToPreview: (index: number) => setCurrentPreviewIndex(index),
    modalSelectedStyle,
    selectModalStyle: (styleId: StyleId) => setModalSelectedStyle(styleId),
    stylingCustomization,
    setStylingCustomization,
    contentCustomization,
    setContentCustomization,
    currentAgent,
    stylingMessages,
    contentMessages,
    coachInput,
    setCoachInput,
    contentSelectedItems,
    currentContentItem,
    contentEnhancementStarted,
    stylePreferences,
    uiFontSize,
    setUiFontSize,
    uiUseBold,
    setUiUseBold,
    uiUseItalic,
    setUiUseItalic,
    uiAccentColor,
    setUiAccentColor,
    startQuestions,
    saveStylePreferences,
    startEnhancing,
    submitAnswer: () => {
      void handleQuestionSubmit();
    },
    resetCoaching,
    toggleContentItem,
  };
}
