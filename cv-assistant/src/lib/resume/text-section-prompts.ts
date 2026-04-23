type TextSectionPromptType = 'profile' | 'skills';
type TextSectionPromptMode = 'enhance' | 'explore';

type TextSectionPromptProject = {
  name?: string;
  description?: string;
  summary?: string;
};

type TextSectionPromptExperience = {
  companyName?: string;
  role?: string;
  timeFrom?: string;
  timeTo?: string;
  description?: string;
  summary?: string;
};

export type TextSectionExploreContext = {
  major?: string;
  school?: string;
  studyPeriod?: string;
  skills?: string;
  projects?: TextSectionPromptProject[];
  experiences?: TextSectionPromptExperience[];
};

type BuildTextSectionPromptParams = {
  type: TextSectionPromptType;
  content?: string;
  mode?: TextSectionPromptMode;
  context?: TextSectionExploreContext;
};

const cleanText = (value?: string | null) => (value || '').trim();

function hasProjectEvidence(project: TextSectionPromptProject) {
  return Boolean(cleanText(project.name) || cleanText(project.description) || cleanText(project.summary));
}

function hasExperienceEvidence(experience: TextSectionPromptExperience) {
  return Boolean(
    cleanText(experience.companyName) ||
      cleanText(experience.role) ||
      cleanText(experience.timeFrom) ||
      cleanText(experience.timeTo) ||
      cleanText(experience.description) ||
      cleanText(experience.summary)
  );
}

export function hasTextSectionExploreEvidence(context?: TextSectionExploreContext) {
  if (!context) return false;

  const hasEducation = Boolean(
    cleanText(context.major) || cleanText(context.school) || cleanText(context.studyPeriod)
  );
  const hasProjects = (context.projects || []).some(hasProjectEvidence);
  const hasExperiences = (context.experiences || []).some(hasExperienceEvidence);

  return hasEducation || hasProjects || hasExperiences;
}

function formatProjects(projects: TextSectionPromptProject[]) {
  const lines = projects
    .filter(hasProjectEvidence)
    .map((project, index) =>
      [
        `${index + 1}. ${cleanText(project.name) || 'Untitled project'}`,
        cleanText(project.summary) ? `Summary: ${cleanText(project.summary)}` : null,
        cleanText(project.description) ? `Description: ${cleanText(project.description)}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );

  return lines.length ? lines.join('\n\n') : 'None provided';
}

function formatExperiences(experiences: TextSectionPromptExperience[]) {
  const lines = experiences
    .filter(hasExperienceEvidence)
    .map((experience, index) => {
      const company = cleanText(experience.companyName) || 'Unknown company';
      const role = cleanText(experience.role) || 'Unknown role';
      const start = cleanText(experience.timeFrom);
      const end = cleanText(experience.timeTo);
      const dateLine = [start, end].filter(Boolean).join(' - ');

      return [
        `${index + 1}. ${company} | ${role}`,
        dateLine ? `Dates: ${dateLine}` : null,
        cleanText(experience.summary) ? `Summary: ${cleanText(experience.summary)}` : null,
        cleanText(experience.description) ? `Description: ${cleanText(experience.description)}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });

  return lines.length ? lines.join('\n\n') : 'None provided';
}

function formatEducation(context?: TextSectionExploreContext) {
  const lines = [
    cleanText(context?.major) ? `Major: ${cleanText(context?.major)}` : null,
    cleanText(context?.school) ? `School: ${cleanText(context?.school)}` : null,
    cleanText(context?.studyPeriod) ? `Study period: ${cleanText(context?.studyPeriod)}` : null,
  ].filter(Boolean);

  return lines.length ? lines.join('\n') : 'None provided';
}

function buildExploreContextBlock(type: TextSectionPromptType, context?: TextSectionExploreContext) {
  return [
    'Candidate evidence:',
    '',
    'Education:',
    formatEducation(context),
    '',
    type === 'profile' && cleanText(context?.skills)
      ? `Existing candidate skills:\n${cleanText(context?.skills)}\n`
      : null,
    'Projects:',
    formatProjects(context?.projects || []),
    '',
    'Experience:',
    formatExperiences(context?.experiences || []),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTextSectionPrompt({
  type,
  content,
  mode = 'enhance',
  context,
}: BuildTextSectionPromptParams) {
  if (mode === 'explore') {
    const contextBlock = buildExploreContextBlock(type, context);

    if (type === 'skills') {
      // Motivation vs Logic:
      // Motivation: Explore needs to derive a recruiter-friendly skills section from the evidence users already entered,
      // not from disconnected keyword stuffing.
      // Logic: Build one evidence-grounded prompt that prioritizes concise, high-signal, ATS-relevant skill categories
      // while keeping the output constrained to skills supported by education, projects, and experience.
      return `You are a senior resume strategist writing ATS-friendly skills sections for competitive hiring.

Task: Create a concise, industrially professional resume skills section using only the verified candidate evidence below.

${contextBlock}

Strict requirements:
- Keep the tone industrially professional, polished, and employer-ready.
- Be concise and clear for a resume.
- Focus on the high-level skills, competencies, tools, and domains that are most mandatory for this candidate's expertise, major, and likely job family.
- Prioritize the strongest employer, HR, and AI-screening signals first.
- Prefer broad professional categories and core technical strengths over low-signal one-off keywords.
- Deduplicate and normalize wording.
- Do not invent tools, certifications, domains, or experience that are not clearly supported by the evidence.
- Return plain text only as one compact comma-separated list or a very short line-separated list.
`;
    }

    return `You are a senior resume strategist writing ATS-friendly professional summaries for competitive hiring.

Task: Create a concise resume profile using only the verified candidate evidence below.

${contextBlock}

Strict requirements:
- Keep the tone industrially professional, polished, and employer-ready.
- Be concise and clear for a resume.
- Write one short paragraph of 2-3 sentences only.
- Emphasize responsibilities, ownership, and enthusiasm for applying this expertise in professional environments.
- Surface the high-level strengths and expertise areas most likely to improve employer, HR, or AI-screening acceptance.
- If the candidate appears early-career, naturally anchor the summary in the major or education without making it sound academic-only.
- Avoid first-person pronouns, generic fluff, and unsupported claims.
- Do not invent achievements, technologies, seniority, or scope that are not grounded in the evidence.
- Return only the summary text.
`;
  }

  if (type === 'skills') {
    return `You are an expert resume editor.

Rewrite this skills section into a concise, polished skills list for a resume.

Rules:
- Preserve only information grounded in the source text.
- Remove duplicates and normalize tool/framework names.
- Keep it compact and professional.
- Return only the improved skills list as plain text.
- Prefer one comma-separated line unless line breaks clearly improve readability.

Skills source:
${content || ''}`;
  }

  return `You are an expert resume editor.

Rewrite this candidate profile into a concise professional summary suitable for a resume.

Rules:
- Preserve only information grounded in the source text.
- Keep the tone factual, polished, and specific.
- Write a short paragraph, not bullet points.
- Avoid first-person pronouns.
- Return only the improved summary text.

Profile source:
${content || ''}`;
}

export function normalizeTextSectionOutput(text: string, fallbackText = '') {
  const normalized = (text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^Here(?:'s| is)\s+[^:\n]+:\s*/i, '')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();

  return normalized || fallbackText;
}
