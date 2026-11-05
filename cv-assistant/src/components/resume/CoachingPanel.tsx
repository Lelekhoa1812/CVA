"use client";

import { useRef } from "react";
import { controlClassName } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AccentColor,
  CoachMessage,
  CoachingAgent,
  ContentSelection,
  FontSize,
  Profile,
  StylePreferences,
} from "@/components/resume/types";
import { cn } from "@/lib/utils";

const FONT_SIZE_OPTIONS: Array<{ value: FontSize; label: string }> = [
  { value: "8pt", label: "extra-small (8pt)" },
  { value: "10pt", label: "small (10pt)" },
  { value: "11pt", label: "default (11pt)" },
  { value: "12pt", label: "large (12pt)" },
  { value: "14pt", label: "extra-large (14pt)" },
];

const ACCENTS: Array<{ value: AccentColor; label: string; swatch: string }> = [
  { value: "black", label: "Default", swatch: "#171717" },
  { value: "dark-blue", label: "Blue", swatch: "#1e3a8a" },
  { value: "dark-gray", label: "Gray", swatch: "#57534e" },
  { value: "dark-green", label: "Green", swatch: "#166534" },
  { value: "crimson", label: "Crimson", swatch: "#9f1239" },
];

const CONTENT_QUESTION_ONE =
  "Question 1: How would you like this content formatted? Choose: 'concise' (shorter, focused bullets), 'preserve' (keep current length), or 'enhance' (expand with more context and achievements)?";

const CONTENT_QUESTION_TWO =
  'Question 2: What specific aspects would you like to emphasize or modify? (e.g., "Focus on technical skills", "Highlight leadership", "Add metrics", "Make it more ATS-friendly")';

type CoachingPanelProps = {
  profile: Profile;
  enhance: boolean;
  setEnhance: (value: boolean) => void;
  aiCoachingEnabled: boolean;
  stylingCustomization: boolean;
  setStylingCustomization: (value: boolean) => void;
  contentCustomization: boolean;
  setContentCustomization: (value: boolean) => void;
  currentAgent: CoachingAgent | null;
  stylingMessages: CoachMessage[];
  contentMessages: CoachMessage[];
  coachInput: string;
  setCoachInput: (value: string) => void;
  contentSelectedItems: ContentSelection[];
  currentContentItem: number;
  contentEnhancementStarted: boolean;
  stylePreferences: StylePreferences | null;
  uiFontSize: FontSize;
  setUiFontSize: (value: FontSize) => void;
  uiUseBold: boolean;
  setUiUseBold: (value: boolean) => void;
  uiUseItalic: boolean;
  setUiUseItalic: (value: boolean) => void;
  uiAccentColor: AccentColor;
  setUiAccentColor: (value: AccentColor) => void;
  selectedProjects: number[];
  selectedExperiences: number[];
  startQuestions: () => void;
  saveStylePreferences: () => void;
  startEnhancing: () => void;
  submitAnswer: () => void;
  resetCoaching: () => void;
  toggleContentItem: (item: ContentSelection, selected: boolean) => void;
};

function readableMessage(content: string) {
  return content.replace(/&quot;/g, '"');
}

export function CoachingPanel({
  profile,
  enhance,
  setEnhance,
  aiCoachingEnabled,
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
  selectedProjects,
  selectedExperiences,
  startQuestions,
  saveStylePreferences,
  startEnhancing,
  submitAnswer,
  resetCoaching,
  toggleContentItem,
}: CoachingPanelProps) {
  const accentGroupRef = useRef<HTMLDivElement>(null);
  const messages = currentAgent === "styling" ? stylingMessages : contentMessages;
  const contentDone = contentEnhancementStarted && contentSelectedItems.length > 0 && currentContentItem >= contentSelectedItems.length;
  const contentProgress = contentSelectedItems.length === 0
    ? "Select items to enhance"
    : !contentEnhancementStarted
      ? `${contentSelectedItems.length} item(s) selected - Click Start to begin`
      : contentDone
        ? `${contentSelectedItems.length}/${contentSelectedItems.length} items enhanced`
        : `${currentContentItem + 1}/${contentSelectedItems.length} items enhanced`;

  function moveAccent(delta: number) {
    const current = ACCENTS.findIndex((option) => option.value === uiAccentColor);
    const next = ACCENTS[(current + delta + ACCENTS.length) % ACCENTS.length];
    setUiAccentColor(next.value);
    accentGroupRef.current?.querySelector<HTMLButtonElement>(`[data-accent="${next.value}"]`)?.focus();
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-start gap-3">
        <Switch id="enhance" checked={enhance} onCheckedChange={setEnhance} aria-label="Manual AI coaching" />
        <div>
          <Label htmlFor="enhance">Manual AI coaching</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional style and content preferences. Styling still works when job tailoring is on.
          </p>
        </div>
      </div>

      {enhance ? (
        <div className="space-y-4 rounded-2xl border border-border bg-[hsl(var(--surface-1)/0.45)] p-4">
          <h3 className="text-sm font-semibold text-foreground">Optional style and content preferences</h3>
          {aiCoachingEnabled ? (
            <div className="surface-subtle rounded-xl p-3 text-xs text-foreground">
              JD-based AI Coaching already auto-selects and rewrites resume items. Manual content
              enhancement is disabled while that mode is enabled, but styling preferences still work.
            </div>
          ) : null}

          {!currentAgent ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch id="styling" checked={stylingCustomization} onCheckedChange={setStylingCustomization} />
                <Label htmlFor="styling">Customize styling preferences</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="content"
                  checked={contentCustomization}
                  disabled={aiCoachingEnabled}
                  onCheckedChange={setContentCustomization}
                />
                <Label htmlFor="content" className={aiCoachingEnabled ? "opacity-50" : undefined}>
                  Enhance your content
                </Label>
              </div>
              <Button type="button" variant="secondary" onClick={startQuestions} disabled={!stylingCustomization && !contentCustomization}>
                Start Questions
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary">{currentAgent === "styling" ? "Styling questions" : "Content questions"}</Badge>
                {contentCustomization && stylingCustomization && currentAgent === "styling" ? (
                  <span className="text-xs text-muted-foreground">Next: Content Questions</span>
                ) : null}
              </div>

              <div className="surface-subtle flex items-center justify-between gap-3 rounded-xl p-3 text-xs text-muted-foreground">
                <span>{currentAgent === "styling" ? "Styling" : "Content progress"}</span>
                <span className="text-right text-foreground">
                  {currentAgent === "styling" ? (stylePreferences ? "Saved" : "Not saved yet") : contentProgress}
                </span>
              </div>

              {currentAgent === "styling" ? (
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
                    <Label htmlFor="resume-font-size">Font size</Label>
                    <select
                      id="resume-font-size"
                      className={cn("h-11 w-full px-3 sm:max-w-xs", controlClassName)}
                      value={uiFontSize}
                      onChange={(event) => setUiFontSize(event.target.value as FontSize)}
                    >
                      {FONT_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
                    <p className="text-sm font-medium text-foreground">Emphasis</p>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Switch id="resume-bold" checked={uiUseBold} onCheckedChange={setUiUseBold} />
                        <Label htmlFor="resume-bold">Bold</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="resume-italic" checked={uiUseItalic} onCheckedChange={setUiUseItalic} />
                        <Label htmlFor="resume-italic">Italic</Label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p id="accent-label" className="text-sm font-medium text-foreground">Accent color</p>
                    <div
                      ref={accentGroupRef}
                      role="radiogroup"
                      aria-labelledby="accent-label"
                      className="flex flex-wrap gap-2"
                      onKeyDown={(event) => {
                        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                          event.preventDefault();
                          moveAccent(1);
                        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                          event.preventDefault();
                          moveAccent(-1);
                        }
                      }}
                    >
                      {ACCENTS.map((option) => {
                        const selected = uiAccentColor === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            data-accent={option.value}
                            aria-checked={selected}
                            onClick={() => setUiAccentColor(option.value)}
                            className={cn(
                              "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm text-foreground",
                              selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                            )}
                          >
                            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: option.swatch }} />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button type="button" onClick={saveStylePreferences}>Save Preferences</Button>

                  {stylePreferences && !contentCustomization ? (
                    <div className="surface-subtle rounded-xl p-3 text-sm text-foreground" role="status">
                      Styling is ready. You can now click Generate PDF to create your resume with these styling choices.
                    </div>
                  ) : null}
                  {stylePreferences && contentCustomization ? (
                    <div className="surface-subtle rounded-xl p-3 text-sm text-foreground" role="status">
                      Styling preferences set successfully.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="surface-subtle rounded-xl p-3 text-sm font-medium text-foreground">
                    Select up to 3 projects or experiences to enhance.
                  </div>

                  {profile.experiences && selectedExperiences.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Experiences:</p>
                      {selectedExperiences.map((index) => {
                        const experience = profile.experiences[index];
                        if (!experience) return null;
                        const name = `${experience.companyName || "Company"} - ${experience.role || "Role"}`;
                        const isSelected = contentSelectedItems.some((item) => item.type === "experience" && item.index === index);
                        return (
                          <button
                            key={`experience-${index}`}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={!isSelected && contentSelectedItems.length >= 3}
                            onClick={() => toggleContentItem({ type: "experience", index, name }, !isSelected)}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left text-sm text-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className={cn("h-4 w-4 shrink-0 rounded border", isSelected ? "border-primary bg-primary" : "border-border")} aria-hidden="true" />
                            <span className="font-medium">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {profile.projects && selectedProjects.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Projects:</p>
                      {selectedProjects.map((index) => {
                        const project = profile.projects[index];
                        if (!project) return null;
                        const name = project.name || "Untitled Project";
                        const isSelected = contentSelectedItems.some((item) => item.type === "project" && item.index === index);
                        return (
                          <button
                            key={`project-${index}`}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={!isSelected && contentSelectedItems.length >= 3}
                            onClick={() => toggleContentItem({ type: "project", index, name }, !isSelected)}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left text-sm text-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className={cn("h-4 w-4 shrink-0 rounded border", isSelected ? "border-primary bg-primary" : "border-border")} aria-hidden="true" />
                            <span className="font-medium">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {contentSelectedItems.length > 0 ? (
                    <Button type="button" onClick={startEnhancing}>
                      Start Enhancing {contentSelectedItems.length} Item{contentSelectedItems.length > 1 ? "s" : ""}
                    </Button>
                  ) : (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      {selectedExperiences.length + selectedProjects.length === 0
                        ? "Choose projects or experiences in the include step first."
                        : "Select projects or experiences above to begin enhancement"}
                    </p>
                  )}

                  {contentEnhancementStarted && contentSelectedItems.length > 0 && currentContentItem < contentSelectedItems.length ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-muted p-3 text-sm font-medium text-foreground">
                        Enhancing: {contentSelectedItems[currentContentItem].name}
                      </div>
                      {contentMessages.length === 0 ? (
                        <div className="surface-subtle rounded-2xl p-3 text-sm text-foreground">{CONTENT_QUESTION_ONE}</div>
                      ) : null}
                      {contentMessages.length === 1 ? (
                        <div className="surface-subtle rounded-2xl p-3 text-sm text-foreground">{CONTENT_QUESTION_TWO}</div>
                      ) : null}
                      {contentMessages.length >= 2 ? (
                        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-foreground" role="status">
                          Content enhancement complete. {currentContentItem + 1 < contentSelectedItems.length ? "Moving to next item..." : "All items enhanced."}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {contentDone ? (
                    <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-foreground" role="status">
                      All content enhancements complete. You can now click Generate PDF to create your resume with the enhanced content.
                    </div>
                  ) : null}
                </div>
              )}

              <Separator />

              <div className="max-h-48 space-y-2 overflow-auto rounded-2xl border border-border bg-background/50 p-3">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {currentAgent === "styling"
                      ? "Save the styling choices above to set your resume appearance."
                      : !contentEnhancementStarted
                        ? "Select items to enhance and click Start to begin the enhancement process."
                        : "Answer the content questions above to enhance your resume content."}
                  </p>
                ) : (
                  messages.map((message, index) => (
                    <p
                      key={`${message.role}-${index}`}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm text-foreground",
                        message.role === "assistant" ? "bg-muted/70" : "bg-primary/10",
                      )}
                    >
                      <span className="mr-1 font-semibold">{message.role === "assistant" ? "System:" : "You:"}</span>
                      <span>{readableMessage(message.content)}</span>
                    </p>
                  ))
                )}
              </div>

              {currentAgent === "content" && contentEnhancementStarted && contentMessages.length < 2 ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Textarea
                    value={coachInput}
                    onChange={(event) => setCoachInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitAnswer();
                      }
                    }}
                    className="min-h-16 flex-1 resize-none"
                    placeholder="Type your answer... (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    aria-label="Coaching answer"
                  />
                  <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={submitAnswer}>
                    Submit
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {currentAgent === "styling"
                    ? "Save font size, emphasis, and accent color before you generate."
                    : "Answer all 2 content questions to enhance your resume content."}
                </p>
                <Button type="button" variant="destructive" size="sm" onClick={resetCoaching}>
                  Reset
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
