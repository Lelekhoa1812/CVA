import type { Profile as DbProfile } from '@/lib/models/User';

export type CoverLetterItem = {
  index: number;
  type: 'project' | 'experience';
  title: string;
  summary: string;
  description: string;
};

export type RankedCoverLetterItem = CoverLetterItem & {
  justification: string;
};

type CoverLetterProfile = Pick<
  DbProfile,
  'name' | 'phone' | 'email' | 'workEmail' | 'website' | 'linkedin' | 'languages' | 'projects' | 'experiences'
>;

function cleanText(value?: string) {
  return (value || '').trim();
}

// Motivation vs Logic:
// Motivation: The cover-letter flow now ranks evidence, drafts the letter, and exports it as PDF, so drift
// between route-specific profile transforms would quickly create mismatched titles, ordering, and contact info.
// Logic: Normalize cover-letter evidence and prompt inputs once here, then reuse the same helpers everywhere the
// feature needs profile-derived data.
export function getCoverLetterItems(profile?: Partial<CoverLetterProfile> | null): CoverLetterItem[] {
  const projects = (profile?.projects || []).map((project, index) => ({
    index,
    type: 'project' as const,
    title: cleanText(project.name) || 'Untitled Project',
    summary: cleanText(project.summary),
    description: cleanText(project.description),
  }));

  const experiences = (profile?.experiences || []).map((experience, index) => ({
    index: projects.length + index,
    type: 'experience' as const,
    title:
      [cleanText(experience.companyName), cleanText(experience.role)]
        .filter(Boolean)
        .join(' - ') || 'Untitled Experience',
    summary: cleanText(experience.summary),
    description: cleanText(experience.description),
  }));

  return [...projects, ...experiences];
}

export function selectCoverLetterItems(
  items: CoverLetterItem[],
  indices?: number[],
): CoverLetterItem[] {
  if (!Array.isArray(indices) || indices.length === 0) return items;

  const selected = indices
    .map((index) => items[index])
    .filter((item): item is CoverLetterItem => Boolean(item));

  return selected.length ? selected : items;
}

export function getCoverLetterContactDetails(profile?: Partial<CoverLetterProfile> | null) {
  const name = cleanText(profile?.name);
  const phone = cleanText(profile?.phone);
  const email = cleanText(profile?.workEmail || profile?.email);
  const website = cleanText(profile?.website);
  const linkedin = cleanText(profile?.linkedin);
  const languages = cleanText(profile?.languages);

  const compactLine = [phone, email, website, linkedin].filter(Boolean).join(' | ');
  const detailLines = [compactLine, languages ? `Languages: ${languages}` : ''].filter(Boolean);
  const promptLines = [name, ...detailLines].filter(Boolean);

  return {
    name,
    phone,
    email,
    website,
    linkedin,
    languages,
    detailLines,
    promptLines,
  };
}

export function buildExperienceRankingPrompt(jobDescription: string, items: CoverLetterItem[]) {
  return `Analyze the Job Description and Candidate Data. Rank the candidate's professional experiences and projects based on their direct relevance to the role's core responsibilities and required skills.

Job Description:
${jobDescription}

Candidate Data:
${items
  .map(
    (item) => `${item.index}. ${item.title}
Type: ${item.type}
Summary: ${item.summary || 'None provided'}
Description: ${item.description || 'None provided'}`,
  )
  .join('\n\n')}

Output Requirements:
- Return only valid JSON.
- Use this exact shape: {"rankings":[{"index":0,"title":"Experience Title","justification":"Concise rationale"}]}
- Rank the strongest matches first and include up to 6 items.
- Each justification must focus on quantifiable impact and keyword alignment with the job description.
- Do not include any introductory text, markdown, or meta-commentary.`;
}

export function buildCoverLetterPrompt(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  contactLines: string[];
  prioritizedItems: CoverLetterItem[];
}) {
  const { candidateName, company, jobDescription, contactLines, prioritizedItems } = args;

  return `Generate a professional, high-conversion cover letter based on the Job Description and the prioritized candidate experiences.

Candidate Name:
${candidateName || 'Candidate'}

Contact Details:
${contactLines.join('\n') || 'Not provided'}

Target Company:
${company}

Job Description:
${jobDescription}

Prioritized Candidate Experiences:
${prioritizedItems
  .map(
    (item, index) => `${index + 1}. ${item.title}
Type: ${item.type}
Relevant Evidence: ${item.summary || item.description || 'No additional detail provided'}`,
  )
  .join('\n\n')}

Instructions:
- Structure the letter with a formal header, a compelling hook, two body paragraphs illustrating specific achievements that solve the employer's needs, and a strong call to action.
- Use professional, persuasive, and direct language.
- Ground the body paragraphs in the prioritized experiences and projects instead of generic claims.
- Output only the final cover letter text.
- Do not include any conversational filler, introductory remarks, placeholders, markdown, or meta-commentary.`;
}
