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

function trimUrlProtocol(value: string) {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .trim();
}

function formatEvidencePromptBlock(items: CoverLetterItem[]) {
  return items
    .map(
      (item, index) => `${index + 1}. ${item.title}
Type: ${item.type}
Relevant evidence: ${item.summary || item.description || 'No additional detail provided'}`,
    )
    .join('\n\n');
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
  const letterheadLines = [
    [phone, email].filter(Boolean).join(' | '),
    [website ? trimUrlProtocol(website) : '', linkedin ? trimUrlProtocol(linkedin) : '']
      .filter(Boolean)
      .join(' | '),
    languages ? `Languages: ${languages}` : '',
  ].filter(Boolean);
  const promptLines = [name, ...detailLines].filter(Boolean);

  return {
    name,
    phone,
    email,
    website,
    linkedin,
    languages,
    detailLines,
    letterheadLines,
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
${formatEvidencePromptBlock(prioritizedItems)}

Instructions:
- Write as if the applicant is trying to maximize interview likelihood with precise, tailored, and credible language.
- Use a formal header, a compelling opening, two body paragraphs with specific proof, and a confident closing.
- Ground the letter in the prioritized experiences and projects instead of generic claims.
- Prefer measurable impact, role alignment, and employer-specific language over broad enthusiasm.
- Keep the tone polished, human, and direct.
- Do not invent facts, companies, titles, tools, or metrics that are not supported by the provided evidence.
- Keep the letter concise and readable, ideally 3 to 4 short paragraphs.
- Do not use an em dash or en dash. Use commas, semicolons, colons, or parentheses instead.
- Output only the final cover letter text.
- Do not include any conversational filler, introductory remarks, placeholders, markdown, or meta-commentary.`;
}

export function buildEmployerQuestionPrompt(args: {
  candidateName?: string;
  company: string;
  jobDescription: string;
  question: string;
  idealWordCount?: string;
  answerStyle?: string;
  prioritizedItems: CoverLetterItem[];
}) {
  const { candidateName, company, jobDescription, question, idealWordCount, answerStyle, prioritizedItems } = args;
  const styleHint = cleanText(answerStyle);
  const wordCountHint = cleanText(idealWordCount);

  return `Write a strong answer to an employer question that maximizes the candidate's chance of progressing in the hiring process.

Candidate Name:
${candidateName || 'Candidate'}

Target Company:
${company || 'Not provided'}

Job Description:
${jobDescription || 'Not provided'}

Employer Question:
${question}

Ideal Word Count:
${wordCountHint || 'Not provided'}

Answer Style:
${styleHint || 'Not provided'}

Prioritized Candidate Evidence:
${formatEvidencePromptBlock(prioritizedItems)}

Instructions:
- Answer the employer's question directly and specifically. Do not drift into generic self-promotion.
- Make the answer sound credible, thoughtful, and tailored to the company and role.
- Use only the supplied evidence and profile context. Do not invent facts, employers, tools, degrees, or numbers.
- Prioritize relevance, measurable impact, and role fit. Lead with the strongest evidence first.
- If an ideal word count is provided, keep the answer close to it. If not provided, keep the answer concise, usually 90 to 140 words unless a shorter factual response is better.
- If an answer style is provided, follow it while keeping the language professional and tailored.
- Use first person and write in a natural hiring-manager-friendly voice.
- If the question asks for a brief fact, stay brief. If it asks for an example, use a tight situation-action-result structure in one or two short paragraphs.
- Do not use bullet points, headings, markdown, or filler.
- Do not use an em dash or en dash. Use commas, semicolons, colons, or parentheses instead.

Examples:
Question: Why are you interested in this role?
Strong answer: I’m interested because the role combines rigorous problem solving with production-minded delivery, which matches the way I’ve built AI systems that improve reliability, grounding, and user trust.

Question: Tell us about a time you improved reliability.
Strong answer: At Harry the Hirer, I led a production-grade multi-agent RAG platform on Azure and focused on grounding, verification, and observability so outputs were not only useful but dependable in day-to-day use.

Output only the final answer.`;
}
