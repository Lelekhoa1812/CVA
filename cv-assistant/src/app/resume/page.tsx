"use client";

import { useRef } from "react";
import Link from "next/link";
import ModuleShell from "@/components/ui/ModuleShell";
import GlassPanel from "@/components/ui/GlassPanel";
import SectionHeading from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AICoachingInput } from "@/components/resume/AICoachingInput";
import { CoachingPanel } from "@/components/resume/CoachingPanel";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { SelectionList } from "@/components/resume/SelectionList";
import { StylePickerDialog } from "@/components/resume/StylePickerDialog";
import { useResumeStudio } from "@/components/resume/useResumeStudio";
import type { Profile } from "@/components/resume/types";
import { MAX_RESUME_ITEMS } from "@/lib/resume/constants";
import { cn } from "@/lib/utils";

const SECTION_LINKS = [
  ["include", "Include"],
  ["tailor", "Tailor"],
  ["coaching", "Coaching"],
  ["preview", "Preview"],
] as const;

function StudioAside() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="section-kicker">How this works</p>
        <h2 className="font-display text-3xl text-foreground">Four calm steps</h2>
        <p className="text-sm leading-7 text-muted-foreground">
          Include the history you want considered, optionally tailor it to a role, set style and coaching, then generate a PDF you can preview and download.
        </p>
      </div>
      <div className="space-y-3">
        {[
          "Choose projects and experiences to include",
          "Paste a job description if you want tailoring",
          "Set coaching, then pick a style and generate",
        ].map((item) => (
          <div key={item} className="surface-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="status-dot" />
            <span className="text-sm text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumeGate({
  missing,
  error,
  onRetry,
}: {
  missing: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const unavailable = Boolean(missing || error);

  return (
    <ModuleShell
      compactMobile
      eyebrow="Resume studio"
      title={missing ? "Your profile is needed" : error ? "Could not load your profile" : "Loading your profile"}
      description={
        missing
          ? "Add your profile details and experience before building a resume."
          : error || "Gathering your projects, experience, and skills."
      }
      aside={
        <div className="space-y-3">
          <p className="section-kicker">Profile</p>
          <h2 className="font-display text-3xl text-foreground">{unavailable ? "Start from your history" : "One moment"}</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            {unavailable
              ? "Resumes are built from the profile page. Add your experience there, then come back."
              : "We are reading the profile that feeds your resume."}
          </p>
        </div>
      }
    >
      {unavailable ? (
        <GlassPanel className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row" role="alert">
            {error ? (
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
            <Link href="/profile" className={cn(buttonVariants(), "w-full sm:w-auto")}>
              Open profile
            </Link>
          </div>
        </GlassPanel>
      ) : (
        <GlassPanel className="p-6">
          <div className="flex items-center gap-4" role="status" aria-live="polite" aria-busy="true">
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Loading your profile...</p>
          </div>
        </GlassPanel>
      )}
    </ModuleShell>
  );
}

function ResumeStudio({
  studio,
  profile,
}: {
  studio: ReturnType<typeof useResumeStudio>;
  profile: Profile;
}) {
  const blocked = studio.generateDisabled && !studio.loading;
  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <ModuleShell
      compactMobile
      eyebrow="Resume studio"
      title="Build a resume for the role you want."
      description="Choose the experience and projects to include, tailor them to a job description, then preview and download your PDF."
      stats={[
        {
          label: "Included",
          value: studio.aiCoachingEnabled ? "Auto" : `${studio.totalSelected}/${MAX_RESUME_ITEMS}`,
        },
        { label: "Tailoring", value: studio.aiCoachingEnabled ? "On" : "Off" },
        { label: "Preview", value: studio.pdfUrl ? "Ready" : studio.loading ? "Working" : "Waiting" },
      ]}
      aside={<StudioAside />}
    >
      <StylePickerDialog
        open={studio.isStyleModalOpen}
        isMobile={studio.isMobile}
        currentPreviewIndex={studio.currentPreviewIndex}
        modalSelectedStyle={studio.modalSelectedStyle}
        aiCoachingInputError={studio.aiCoachingInputError}
        restoreFocusRef={previewRef}
        onClose={studio.closeStyleModal}
        onPrev={studio.prevPreview}
        onNext={studio.nextPreview}
        onGoTo={studio.goToPreview}
        onSelectStyle={studio.selectModalStyle}
        onGenerate={() => {
          void studio.confirmStyle();
        }}
      />

      <nav
        aria-label="Resume studio sections"
        className="sticky top-[5.25rem] z-30 -mx-1 flex snap-x gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-[hsl(var(--surface-1)/0.96)] p-2 shadow-elevated backdrop-blur-xl xl:hidden"
      >
        {SECTION_LINKS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border border-border/70 bg-[hsl(var(--surface-2)/0.8)] px-3 text-xs font-medium text-muted-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      {studio.error ? (
        <GlassPanel className="border-destructive/40 p-4">
          <p className="text-sm text-destructive" role="alert">{studio.error}</p>
        </GlassPanel>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-6">
          <GlassPanel id="include" className="scroll-mt-36 p-4 sm:p-8">
            <SectionHeading
              eyebrow="Step 1"
              title="What to include"
              description="Edit the skills for this application, then choose the experiences and projects that should be considered."
              action={
                <Badge variant={studio.limitReached ? "destructive" : "secondary"} className="whitespace-normal">
                  {studio.aiCoachingEnabled
                    ? "Auto-ranked on generate"
                    : `${studio.totalSelected}/${MAX_RESUME_ITEMS} selected`}
                </Badge>
              }
            />
            <div className="mt-6 space-y-2">
              <Label htmlFor="resume-skills">Skills</Label>
              <p className="text-sm text-muted-foreground">Add the skills most relevant to this application.</p>
              <Textarea
                id="resume-skills"
                className="min-h-28 resize-y"
                placeholder="e.g., JavaScript, React, Node.js, Python, SQL"
                value={studio.skills}
                onChange={(event) => studio.setSkills(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate skills with commas. Keep the list concise and relevant.</p>
            </div>
            <Separator className="my-6" />
            <div className="grid gap-6 lg:grid-cols-2">
              <SelectionList
                title="Experiences"
                emptyLabel="No experiences yet. Add them on your profile."
                disabled={studio.aiCoachingEnabled}
                selected={studio.selectedExperiences}
                onToggle={studio.toggleExperience}
                items={(profile.experiences ?? []).map((experience, index) => ({
                  index,
                  title: `${experience.companyName} — ${experience.role}`,
                  summary: experience.summary,
                }))}
              />
              <SelectionList
                title="Projects"
                emptyLabel="No projects yet. Add them on your profile."
                disabled={studio.aiCoachingEnabled}
                selected={studio.selectedProjects}
                onToggle={studio.toggleProject}
                items={(profile.projects ?? []).map((project, index) => ({
                  index,
                  title: project.name || "Untitled Project",
                  summary: project.summary,
                }))}
              />
            </div>
            {studio.limitReached ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                You can include at most {MAX_RESUME_ITEMS} items. Please deselect some.
              </p>
            ) : null}
          </GlassPanel>

          <GlassPanel id="tailor" className="scroll-mt-36 p-4 sm:p-8">
            <SectionHeading
              eyebrow="Step 2 · Optional"
              title="Tailor to a job"
              description="Rank your experience and projects against a job description, then tailor the strongest matches while keeping your resume grounded in your history."
            />
            <div className="mt-6">
              <AICoachingInput
                enabled={studio.aiCoachingEnabled}
                jobDescription={studio.jobDescription}
                disabled={studio.loading}
                error={studio.aiCoachingInputError}
                onEnabledChange={studio.setAiCoachingEnabled}
                onJobDescriptionChange={studio.setJobDescription}
              />
            </div>
            {studio.aiCoachingEnabled ? (
              <div className="surface-subtle mt-4 rounded-2xl p-4 text-sm text-foreground">
                AI Coaching will score your full project and experience history against the job description,
                keep the strongest matches, and rewrite each retained item individually for a more
                detailed, job-aligned resume.
              </div>
            ) : null}
          </GlassPanel>

          <GlassPanel id="coaching" className="scroll-mt-36 p-4 sm:p-8">
            <SectionHeading
              eyebrow="Step 3 · Optional"
              title="Style and coaching"
              description="Set font size, emphasis, and accent color, or rewrite up to three selected items before you generate."
            />
            <CoachingPanel
              profile={profile}
              enhance={studio.enhance}
              setEnhance={studio.setEnhance}
              aiCoachingEnabled={studio.aiCoachingEnabled}
              stylingCustomization={studio.stylingCustomization}
              setStylingCustomization={studio.setStylingCustomization}
              contentCustomization={studio.contentCustomization}
              setContentCustomization={studio.setContentCustomization}
              currentAgent={studio.currentAgent}
              stylingMessages={studio.stylingMessages}
              contentMessages={studio.contentMessages}
              coachInput={studio.coachInput}
              setCoachInput={studio.setCoachInput}
              contentSelectedItems={studio.contentSelectedItems}
              currentContentItem={studio.currentContentItem}
              contentEnhancementStarted={studio.contentEnhancementStarted}
              stylePreferences={studio.stylePreferences}
              uiFontSize={studio.uiFontSize}
              setUiFontSize={studio.setUiFontSize}
              uiUseBold={studio.uiUseBold}
              setUiUseBold={studio.setUiUseBold}
              uiUseItalic={studio.uiUseItalic}
              setUiUseItalic={studio.setUiUseItalic}
              uiAccentColor={studio.uiAccentColor}
              setUiAccentColor={studio.setUiAccentColor}
              selectedProjects={studio.selectedProjects}
              selectedExperiences={studio.selectedExperiences}
              startQuestions={studio.startQuestions}
              saveStylePreferences={studio.saveStylePreferences}
              startEnhancing={studio.startEnhancing}
              submitAnswer={studio.submitAnswer}
              resetCoaching={studio.resetCoaching}
              toggleContentItem={studio.toggleContentItem}
            />
          </GlassPanel>
        </div>

        <div
          id="preview"
          ref={previewRef}
          tabIndex={-1}
          className="min-w-0 scroll-mt-36 outline-none xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
        >
          <GlassPanel className="p-4 sm:p-6">
            <SectionHeading
              eyebrow="Step 4"
              title="Generate and preview"
              description="Pick a style, then review the PDF here. Download it or jump back to edit."
            />
            <div className="mt-6 space-y-4">
              {!studio.coachingComplete ? (
                <div className="surface-subtle rounded-xl border border-[hsl(var(--warm)/0.45)] p-3" role="status" aria-live="polite">
                  <div className="flex items-center gap-2">
                    <span className="status-dot" />
                    <span className="text-sm font-medium text-foreground">AI Coaching in Progress</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Please complete your coaching session or click Reset to cancel
                  </p>
                </div>
              ) : null}
              {studio.limitReached ? (
                <p className="text-sm text-destructive" role="alert">
                  You can include at most {MAX_RESUME_ITEMS} items across projects and experiences.
                </p>
              ) : null}
              <Button
                ref={studio.generateButtonRef}
                type="button"
                variant={blocked ? "secondary" : "default"}
                className="w-full"
                disabled={studio.generateDisabled}
                title={studio.generationBlockedReason || undefined}
                onClick={studio.openStyleModal}
              >
                {studio.loading ? studio.loadingMessage : "Generate PDF"}
              </Button>
              <ResumePreview
                pdfUrl={studio.pdfUrl}
                loading={studio.loading}
                loadingMessage={studio.loadingMessage}
                onEdit={studio.resetPreview}
              />
            </div>
          </GlassPanel>
        </div>
      </div>
    </ModuleShell>
  );
}

export default function ResumePage() {
  const studio = useResumeStudio();

  if (!studio.profile) {
    return (
      <ResumeGate
        missing={studio.profileMissing}
        error={studio.profileLoadError}
        onRetry={studio.retryProfile}
      />
    );
  }

  return <ResumeStudio studio={studio} profile={studio.profile} />;
}
