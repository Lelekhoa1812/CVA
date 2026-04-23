import { runAICoaching, type ResumeProfile } from "@/lib/resume/ai-coaching";
import { formatResumeProfileParagraph } from "@/lib/resume/profile";
import { formatResumeSkillsParagraph, resolveResumeSkillsText } from "@/lib/resume/skills";
import { validateResumeDraft } from "@/lib/career/ats";
import type { JobEvaluationResult, TailoringResult, UserContextSnapshot } from "@/lib/career/types";
import { buildPeriod, cleanText, splitList, topKeywords } from "@/lib/career/utils";

type StoredProfile = ResumeProfile & {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  skills?: string;
  languages?: string;
  profileSummary?: string;
};

type LeadLike = {
  title: string;
  company: string;
  canonicalJobDescription: string;
  extractedKeywords: string[];
};

function toBulletLines(value: string) {
  return cleanText(value)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResumeVariant(
  draft: TailoringResult["resumeDraft"],
  profile: StoredProfile,
  variant: "executive" | "clean" | "modern",
) {
  const palettes = {
    executive: {
      accent: "#155e75",
      accentSoft: "#e6f6fb",
      secondary: "#1f2937",
    },
    clean: {
      accent: "#0f766e",
      accentSoft: "#e6fffb",
      secondary: "#111827",
    },
    modern: {
      accent: "#7c3aed",
      accentSoft: "#f3e8ff",
      secondary: "#172554",
    },
  } as const;
  const palette = palettes[variant];
  const contactLine = [profile.name, profile.school, profile.major].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(profile.name || "Candidate")} — ${escapeHtml(variant)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #ffffff;
        --ink: #0f172a;
        --muted: #475569;
        --rule: #dbe4ee;
        --accent: ${palette.accent};
        --accent-soft: ${palette.accentSoft};
        --secondary: ${palette.secondary};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Inter", "Segoe UI", sans-serif;
        line-height: 1.55;
      }
      .page {
        max-width: 920px;
        margin: 0 auto;
        padding: 40px 48px 56px;
      }
      .hero {
        border-bottom: 1px solid var(--rule);
        padding-bottom: 18px;
        margin-bottom: 24px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border-radius: 999px;
        padding: 6px 12px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 8px;
        font-size: 34px;
        line-height: 1.05;
        letter-spacing: -0.04em;
        color: var(--secondary);
      }
      .hero-copy {
        color: var(--muted);
        font-size: 15px;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
        gap: 24px;
      }
      .section {
        margin-bottom: 24px;
      }
      .section h2 {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .summary {
        font-size: 15px;
        color: var(--secondary);
      }
      .pill-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pill {
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .entry {
        border: 1px solid var(--rule);
        border-radius: 18px;
        padding: 16px 18px;
        margin-bottom: 14px;
      }
      .entry-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 8px;
      }
      .entry-title {
        font-size: 17px;
        font-weight: 700;
        color: var(--secondary);
      }
      .entry-subtitle {
        font-size: 14px;
        color: var(--muted);
      }
      ul {
        margin: 10px 0 0;
        padding-left: 18px;
      }
      li { margin-bottom: 6px; }
      .coverage {
        border-radius: 22px;
        background: #f8fafc;
        border: 1px solid var(--rule);
        padding: 18px;
      }
      .coverage-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 0;
        border-bottom: 1px solid var(--rule);
      }
      .coverage-row:last-child { border-bottom: 0; }
      .coverage-badge {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .covered { color: #0f766e; }
      .partial { color: #b45309; }
      .gap { color: #b91c1c; }
      .meta {
        color: var(--muted);
        font-size: 13px;
      }
      @media (max-width: 860px) {
        .page { padding: 28px 24px 36px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <div class="eyebrow">${escapeHtml(variant)} blueprint</div>
        <h1>${escapeHtml(draft.headline)}</h1>
        <div class="hero-copy">${escapeHtml(contactLine)}</div>
      </header>
      <div class="grid">
        <div>
          <section class="section">
            <h2>Professional Summary</h2>
            <div class="summary">${escapeHtml(draft.summary)}</div>
          </section>
          <section class="section">
            <h2>Work Experience</h2>
            ${draft.experiences
              .map(
                (experience) => `
                <article class="entry">
                  <div class="entry-head">
                    <div>
                      <div class="entry-title">${escapeHtml(experience.role)}</div>
                      <div class="entry-subtitle">${escapeHtml(experience.company)}</div>
                    </div>
                    <div class="meta">${escapeHtml(experience.period)}</div>
                  </div>
                  <ul>${experience.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
                </article>`,
              )
              .join("")}
          </section>
          <section class="section">
            <h2>Projects</h2>
            ${draft.projects
              .map(
                (project) => `
                <article class="entry">
                  <div class="entry-title">${escapeHtml(project.name)}</div>
                  <div class="entry-subtitle">${escapeHtml(project.label)}</div>
                  <ul>${project.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
                </article>`,
              )
              .join("")}
          </section>
        </div>
        <aside>
          <section class="section">
            <h2>Core Competencies</h2>
            <div class="pill-grid">
              ${draft.competencies.map((competency) => `<span class="pill">${escapeHtml(competency)}</span>`).join("")}
            </div>
          </section>
          <section class="section">
            <h2>Education</h2>
            ${draft.education
              .map(
                (education) => `
                <div class="entry">
                  <div class="entry-title">${escapeHtml(education.credential)}</div>
                  <div class="entry-subtitle">${escapeHtml(education.school)}</div>
                  <div class="meta">${escapeHtml(education.period)}</div>
                </div>`,
              )
              .join("")}
          </section>
          <section class="section">
            <h2>Skills & Languages</h2>
            <div class="meta">${escapeHtml(draft.skills.join(", "))}</div>
            ${
              draft.languages.length
                ? `<div class="meta" style="margin-top:12px;">${escapeHtml(draft.languages.join(", "))}</div>`
                : ""
            }
          </section>
          <section class="section">
            <h2>Requirement Coverage</h2>
            <div class="coverage">
              ${draft.requirementCoverage
                .map(
                  (match) => `
                  <div class="coverage-row">
                    <div>
                      <div>${escapeHtml(match.requirement)}</div>
                      <div class="meta">${escapeHtml(match.matchedFacts.join(", ") || "No direct evidence yet")}</div>
                    </div>
                    <div class="coverage-badge ${escapeHtml(match.coverage)}">${escapeHtml(match.coverage)}</div>
                  </div>`,
                )
                .join("")}
            </div>
          </section>
        </aside>
      </div>
    </div>
  </body>
</html>`;
}

function buildResumeDraft(args: {
  profile: StoredProfile;
  lead: LeadLike;
  context: UserContextSnapshot;
  evaluation: JobEvaluationResult;
  coachingResult: Awaited<ReturnType<typeof runAICoaching>>;
}) {
  const { profile, lead, context, evaluation, coachingResult } = args;
  const selectedProjectSet = new Set(coachingResult.selectedProjects);
  const selectedExperienceSet = new Set(coachingResult.selectedExperiences);
  const competencies = Array.from(
    new Set([
      ...lead.extractedKeywords.slice(0, 8),
      ...topKeywords(resolveResumeSkillsText(profile.skills) || "", 6),
    ]),
  ).slice(0, 10);

  const experiences = (profile.experiences || [])
    .map((experience, index) => {
      if (!selectedExperienceSet.has(index)) return null;
      const rewritten = coachingResult.contentEnhancementData[`experience-${index}`] || experience.summary || experience.description || "";
      return {
        company: cleanText(experience.companyName) || "Company",
        role: cleanText(experience.role) || "Role",
        period: buildPeriod(experience.timeFrom, experience.timeTo),
        bullets: toBulletLines(rewritten),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const projects = (profile.projects || [])
    .map((project, index) => {
      if (!selectedProjectSet.has(index)) return null;
      const rewritten = coachingResult.contentEnhancementData[`project-${index}`] || project.summary || project.description || "";
      return {
        name: cleanText(project.name) || "Project",
        label: "Selected proof point",
        bullets: toBulletLines(rewritten),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    headline: `${cleanText(profile.name) || "Candidate"} — ${lead.title}`,
    summary:
      formatResumeProfileParagraph(profile.profileSummary) ||
      `Targeting ${lead.title} roles with proven experience across ${competencies.slice(0, 4).join(", ")}.`,
    competencies,
    experiences,
    projects,
    education: [
      {
        school: cleanText(profile.school) || "Education",
        credential: cleanText(profile.major) || "Major",
        period: cleanText(profile.studyPeriod),
      },
    ].filter((education) => education.school || education.credential),
    skills: splitList(formatResumeSkillsParagraph(profile.skills, context.techStackPreferences.join(", "))).slice(0, 14),
    languages: splitList(profile.languages).slice(0, 6),
    requirementCoverage: evaluation.matchedRequirements,
  };
}

/* Motivation vs Logic:
   Motivation: The Resume Specialist should reuse the strongest evidence-ranking path we already have, then turn the
   output into a semantic draft that the control room can preview, validate, diff, and version without being tied to
   any single PDF route.
   Logic: Run the existing JD-aware coaching engine once, assemble a shared resume draft from the retained evidence,
   and emit variant HTML artifacts plus a JSON artifact from the same draft so preview and export start from one source. */
export async function createTailoringArtifacts(args: {
  profile: StoredProfile;
  lead: LeadLike;
  context: UserContextSnapshot;
  evaluation: JobEvaluationResult;
}) {
  const { profile, lead, context, evaluation } = args;
  const coachingResult = await runAICoaching({
    jobDescription: lead.canonicalJobDescription,
    profile,
  });

  const resumeDraft = buildResumeDraft({
    profile,
    lead,
    context,
    evaluation,
    coachingResult,
  });

  const atsValidation = validateResumeDraft(resumeDraft, {
    keywords: lead.extractedKeywords,
    pageBudget: 2,
  });

  const evidenceSet = coachingResult.rankedItems
    .filter(
      (item) =>
        coachingResult.selectedProjects.includes(item.type === "project" ? item.index : -1) ||
        coachingResult.selectedExperiences.includes(item.type === "experience" ? item.index : -1),
    )
    .map((item) => ({
      type: item.type,
      index: item.index,
      title: item.name,
      score: item.score,
      matchedKeywords: item.matchedKeywords,
      rewrittenContent: coachingResult.contentEnhancementData[`${item.type}-${item.index}`] || item.originalContent,
    }));

  const htmlArtifacts = (["executive", "clean", "modern"] as const).map((variant) => ({
    artifactType: "resume_html" as const,
    variant,
    mimeType: "text/html",
    body: renderResumeVariant(resumeDraft, profile, variant),
    summary: `${variant} semantic preview`,
  }));

  return {
    evidenceSet,
    resumeDraft,
    atsValidation,
    artifacts: [
      ...htmlArtifacts,
      {
        artifactType: "resume_json" as const,
        variant: "executive" as const,
        mimeType: "application/json",
        body: JSON.stringify(resumeDraft, null, 2),
        summary: "Semantic draft source-of-truth",
      },
    ],
  } satisfies TailoringResult;
}
