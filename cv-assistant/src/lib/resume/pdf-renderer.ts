import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { generateJsonSafe, getModel } from '@/lib/ai';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { formatResumeSkillsParagraph, resolveResumeSkillsText } from '@/lib/resume/skills';
import { stripMarkdownForPdf, wrapTextLines } from '@/app/api/resume/pdf-layout';

export type ResumeTemplateId = 'style1' | 'style2' | 'style3' | 'style4' | 'style5';

type Project = { name?: string; summary?: string; description?: string };
type Experience = { companyName?: string; role?: string; location?: string; summary?: string; description?: string; timeFrom?: string; timeTo?: string };

export type ResumePdfProfile = {
  name?: string;
  major?: string;
  school?: string;
  studyPeriod?: string;
  email?: string;
  workEmail?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  profileSummary?: string;
  skills?: string;
  languages?: string;
  projects?: Project[];
  experiences?: Experience[];
};

type StylePreferences = { fontSize?: string; useBold?: boolean; contentDensity?: string; accentColor?: 'black' | 'dark-blue' | 'dark-gray' | 'crimson' | 'dark-green' };

export type ResumeRenderRequest = {
  skills?: string;
  selectedProjects: number[];
  selectedExperiences: number[];
  enhance?: boolean;
  qa?: Array<{ role: string; content: string }>;
  stylePreferences?: StylePreferences | null;
  contentEnhancementData?: Record<string, string>;
  jobDescription?: string;
  autoFit?: boolean;
  coachingTrace?: unknown;
};

type DensityPreset = { key: 'professional' | 'compact' | 'micro'; marginX: number; marginY: number; nameSize: number; contactSize: number; sectionSize: number; titleSize: number; metaSize: number; bodySize: number; lineHeight: number; sectionGap: number; itemGap: number; bulletGap: number; maxExperienceBullets: number; maxProjectBullets: number };
type CandidateItem = { type: 'experience' | 'project'; index: number; title: string; subtitle: string; meta: string; location: string; body: string; weight: number };
type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; usingTimes: boolean };
type RenderAttempt = { bytes: Uint8Array; pageCount: number; lastPageFillRatio: number; density: DensityPreset; items: CandidateItem[]; usingTimes: boolean };
type PreparedNarrative = { summary: string; skills: string };

type DrawContext = ReturnType<typeof createDrawContext>;

export type ResumePdfResult = {
  bytes: Uint8Array;
  telemetry: { pageCount: number; density: string; atsScore: number; selectedExperiences: number; selectedProjects: number; finalItemCount: number; lastPageFillRatio: number; usingTimes: boolean; truncatedToTwoPages: boolean };
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MAX_PAGES = 2;
const TARGET_MIN_LAST_PAGE_FILL = 0.60;
const INK = rgb(0.055, 0.055, 0.055);
const MUTED = rgb(0.30, 0.30, 0.30);
const RULE = rgb(0.55, 0.55, 0.55);
const SOFT = rgb(0.955, 0.955, 0.955);
const PALE = rgb(0.982, 0.982, 0.982);
const WHITE = rgb(1, 1, 1);

const DENSITIES: DensityPreset[] = [
  { key: 'professional', marginX: 30, marginY: 24, nameSize: 18, contactSize: 6.5, sectionSize: 10.4, titleSize: 8.35, metaSize: 7.2, bodySize: 7.15, lineHeight: 8.55, sectionGap: 3.7, itemGap: 2.4, bulletGap: 0.8, maxExperienceBullets: 4, maxProjectBullets: 3 },
  { key: 'compact', marginX: 27, marginY: 22, nameSize: 17, contactSize: 6.2, sectionSize: 9.9, titleSize: 8.05, metaSize: 6.9, bodySize: 6.9, lineHeight: 8.1, sectionGap: 3.1, itemGap: 1.9, bulletGap: 0.55, maxExperienceBullets: 4, maxProjectBullets: 2 },
  { key: 'micro', marginX: 24, marginY: 20, nameSize: 16, contactSize: 5.95, sectionSize: 9.35, titleSize: 7.75, metaSize: 6.6, bodySize: 6.55, lineHeight: 7.65, sectionGap: 2.5, itemGap: 1.4, bulletGap: 0.35, maxExperienceBullets: 3, maxProjectBullets: 2 },
];

function normalizeInline(value?: string | null) {
  return (value || '').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function normalizeBody(value?: string | null) {
  return (value || '').replace(/\r\n/g, '\n').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

function isStandardFontSafe(value: string) {
  return [...value].every((char) => char.charCodeAt(0) <= 255);
}

function accentColor(key?: string): RGB {
  if (key === 'dark-blue') return rgb(0.06, 0.16, 0.33);
  if (key === 'dark-gray') return rgb(0.16, 0.16, 0.16);
  if (key === 'crimson') return rgb(0.48, 0.06, 0.10);
  if (key === 'dark-green') return rgb(0.05, 0.26, 0.14);
  return rgb(0.04, 0.04, 0.04);
}

function tintFromAccent(accent: RGB) {
  return rgb(Math.min(0.97, 0.86 + accent.red * 0.10), Math.min(0.97, 0.86 + accent.green * 0.10), Math.min(0.97, 0.86 + accent.blue * 0.10));
}

function parsePreferredBodySize(stylePreferences?: StylePreferences | null) {
  const raw = stylePreferences?.fontSize || '';
  const match = raw.match(/(\d+(?:\.\d+)?)pt/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(6.4, Math.min(8.15, parsed - 2.2));
}

function applyStylePreferenceDensity(preset: DensityPreset, stylePreferences?: StylePreferences | null): DensityPreset {
  const preferredBody = parsePreferredBodySize(stylePreferences);
  if (!preferredBody) return preset;
  const delta = preferredBody - preset.bodySize;
  return { ...preset, bodySize: preferredBody, lineHeight: Math.max(preferredBody + 1.05, preset.lineHeight + delta), titleSize: Math.max(preferredBody + 0.7, preset.titleSize + delta * 0.55), sectionSize: Math.max(preferredBody + 1.75, preset.sectionSize + delta * 0.55) };
}

function splitBulletSource(text: string): string[] {
  const plain = stripMarkdownForPdf(normalizeBody(text));
  if (!plain) return [];
  const lineBullets = plain.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  if (lineBullets.length > 1) return lineBullets;
  const markerBullets = plain.replace(/\s+[•]\s+/g, '\n').replace(/\s+-\s+(?=[A-Z0-9])/g, '\n').split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  if (markerBullets.length > 1) return markerBullets;
  const sentenceBullets = plain.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((line) => line.trim()).filter((line) => line.length > 18);
  return sentenceBullets.length ? sentenceBullets : [plain];
}

function splitBullets(text: string, maxBullets: number) {
  return splitBulletSource(text).slice(0, maxBullets);
}

function compactWords(text: string, maxWords: number) {
  const words = normalizeInline(text).split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(' ') : `${words.slice(0, maxWords).join(' ')}.`;
}

function compactSkillsFallback(skillsText: string, jobDescription?: string) {
  const sourceItems = formatResumeSkillsParagraph(skillsText).split(/[,;\n]+/).map((item) => normalizeInline(item)).filter(Boolean);
  const jd = (jobDescription || '').toLowerCase();
  const scored = sourceItems.map((item, index) => {
    const tokens = item.toLowerCase().match(/[a-z][a-z0-9+#.\-]{2,}/g) || [];
    const score = tokens.reduce((total, token) => total + (jd.includes(token) ? 4 : 0), 0) + Math.max(0, 16 - index * 0.08);
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 38).map((entry) => entry.item).join(', ');
}

function compactSummaryFallback(profile: ResumePdfProfile, jobDescription?: string) {
  const raw = normalizeInline(profile.profileSummary);
  if (raw) return compactWords(raw, 58);
  const roleSignals = (profile.experiences || []).slice(0, 3).map((experience) => experience.role).filter(Boolean).join(', ');
  const stack = compactSkillsFallback(resolveResumeSkillsText('', '', profile.skills), jobDescription).split(', ').slice(0, 12).join(', ');
  return compactWords(`AI and Software Engineer focused on ${roleSignals || normalizeInline(profile.major) || 'production software delivery'}, with hands-on capability across ${stack}. Builds reliable systems, automation workflows, data products, and stakeholder-ready engineering outcomes.`, 58);
}

function buildContactLine(profile: ResumePdfProfile) {
  const preferredEmail = normalizeInline(profile.workEmail) || normalizeInline(profile.email);
  return [preferredEmail, profile.phone, profile.website, profile.linkedin].map((item) => normalizeInline(item)).filter(Boolean).join(' | ');
}

function deriveKeywords(jobDescription?: string) {
  const stop = new Set(['and', 'the', 'for', 'with', 'you', 'our', 'will', 'are', 'this', 'that', 'from', 'have', 'has', 'your', 'role', 'work', 'team', 'job', 'about', 'into', 'using', 'use', 'their', 'they', 'who', 'can', 'all', 'more', 'such', 'than', 'then', 'been', 'but', 'not', 'we', 'as', 'in', 'on', 'to', 'of', 'a', 'an', 'is', 'be', 'or', 'at', 'by']);
  return [...new Set((jobDescription || '').toLowerCase().match(/[a-z][a-z0-9+#.\-]{2,}/g)?.filter((word) => !stop.has(word)) || [])].slice(0, 70);
}

function scoreAts(text: string, jobDescription?: string, pages = 1) {
  const keywords = deriveKeywords(jobDescription);
  if (!keywords.length) return pages <= 2 ? 84 : 62;
  const body = text.toLowerCase();
  const matched = keywords.filter((keyword) => body.includes(keyword));
  const coverage = matched.length / keywords.length;
  const pagePenalty = pages > 2 ? 25 : 0;
  return Math.max(0, Math.min(100, Math.round(52 + coverage * 48 - pagePenalty)));
}

function collectItems(args: { profile: ResumePdfProfile; request: ResumeRenderRequest; enhancedProjects: Record<number, string>; enhancedExperiences: Record<number, string> }) {
  const contentEnhancementData = args.request.contentEnhancementData || {};
  const experiences = (args.profile.experiences || []).map((experience, index) => ({ experience, index })).filter(({ index }) => args.request.selectedExperiences.includes(index)).map(({ experience, index }) => {
    const role = normalizeInline(experience.role);
    const company = normalizeInline(experience.companyName);
    const location = normalizeInline(experience.location);
    const title = role || company || 'Experience';
    const subtitle = [company && role ? company : '', location].filter(Boolean).join(' · ');
    const meta = [experience.timeFrom, experience.timeTo].map(normalizeInline).filter(Boolean).join(' - ');
    const body = normalizeBody(contentEnhancementData[`experience-${index}`] || args.enhancedExperiences[index] || experience.description || experience.summary);
    return { type: 'experience' as const, index, title, subtitle, meta, location, body, weight: 1000 - index };
  });
  const projects = (args.profile.projects || []).map((project, index) => ({ project, index })).filter(({ index }) => args.request.selectedProjects.includes(index)).map(({ project, index }) => {
    const body = normalizeBody(contentEnhancementData[`project-${index}`] || args.enhancedProjects[index] || project.description || project.summary);
    return { type: 'project' as const, index, title: normalizeInline(project.name) || 'Project', subtitle: '', meta: '', location: '', body, weight: 410 - index };
  });
  return [...experiences, ...projects].filter((item) => item.title || item.body);
}

function collectBackfillItems(profile: ResumePdfProfile, selected: CandidateItem[]) {
  const selectedKeys = new Set(selected.map((item) => `${item.type}-${item.index}`));
  const experiences = (profile.experiences || []).map((experience, index) => {
    const location = normalizeInline(experience.location);
    return { type: 'experience' as const, index, title: normalizeInline(experience.role) || normalizeInline(experience.companyName) || 'Experience', subtitle: [normalizeInline(experience.companyName), location].filter(Boolean).join(' · '), meta: [experience.timeFrom, experience.timeTo].map(normalizeInline).filter(Boolean).join(' - '), location, body: normalizeBody(experience.description || experience.summary), weight: 860 - index };
  });
  const projects = (profile.projects || []).map((project, index) => ({ type: 'project' as const, index, title: normalizeInline(project.name) || 'Project', subtitle: '', meta: '', location: '', body: normalizeBody(project.description || project.summary), weight: 300 - index }));
  return [...experiences, ...projects].filter((item) => !selectedKeys.has(`${item.type}-${item.index}`) && (item.title || item.body)).sort((a, b) => b.weight - a.weight);
}

async function maybeEnhanceContent(args: { profile: ResumePdfProfile; request: ResumeRenderRequest }) {
  const enhancedProjects: Record<number, string> = {};
  const enhancedExperiences: Record<number, string> = {};
  let enhancedSkills: string | undefined;
  if (!args.request.enhance) return { enhancedSkills, enhancedProjects, enhancedExperiences };
  try {
    const model = getModel('hard');
    const jd = args.request.jobDescription ? `\nTarget job description:\n${args.request.jobDescription}` : '';
    const qaNotes = Array.isArray(args.request.qa) && args.request.qa.length ? `\nUser coaching notes:\n${args.request.qa.map((m) => `[${m.role}] ${m.content}`).join('\n')}` : '';
    async function improve(prompt: string) {
      const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      return res.response.text().trim();
    }
    if (args.request.skills) enhancedSkills = await improve(`Rewrite these resume skills into one dense ATS-friendly comma-separated line. Prioritize JD-matching skills already supported by the source. Do not invent technologies.${jd}${qaNotes}\nSkills:\n${args.request.skills}`);
    for (const idx of args.request.selectedExperiences) {
      const experience = args.profile.experiences?.[idx];
      const source = experience?.description || experience?.summary || '';
      if (!experience || !source.trim()) continue;
      enhancedExperiences[idx] = await improve(`Rewrite this work experience into 4 strong, dense resume bullets for the target role. Preserve supported technologies, ownership, scope, outcomes, and qualities. Do not invent employers, metrics, credentials, or technologies. Return newline bullets only.${jd}${qaNotes}\nCompany: ${experience.companyName || ''}\nRole: ${experience.role || ''}\nLocation: ${experience.location || ''}\nSource:\n${source}`);
    }
    for (const idx of args.request.selectedProjects) {
      const project = args.profile.projects?.[idx];
      const source = project?.description || project?.summary || '';
      if (!project || !source.trim()) continue;
      enhancedProjects[idx] = await improve(`Rewrite this project into 2-3 strong resume bullets for the target role. Preserve supported facts and technical stack. Return newline bullets only.${jd}${qaNotes}\nProject: ${project.name || ''}\nSource:\n${source}`);
    }
  } catch (error) {
    console.warn('Shared resume enhancement skipped:', error);
  }
  return { enhancedSkills, enhancedProjects, enhancedExperiences };
}

async function maybePrepareNarrative(args: { profile: ResumePdfProfile; request: ResumeRenderRequest; enhancedSkills?: string; items: CandidateItem[] }): Promise<PreparedNarrative> {
  const fallback = { summary: compactSummaryFallback(args.profile, args.request.jobDescription), skills: compactSkillsFallback(resolveResumeSkillsText(args.enhancedSkills, args.request.skills, args.profile.skills), args.request.jobDescription) };
  if (!args.request.jobDescription || (!args.request.autoFit && !args.request.enhance)) return fallback;
  try {
    const raw = await generateJsonSafe('easy', `You are a senior resume editor. Build compact resume Summary and Skills content matching the JD while staying truthful to candidate evidence.
Return strict JSON: {"summary":"2 concise sentences, max 58 words", "skills":"comma-separated skills, max 38 items"}
Rules:
- Do not invent jobs, credentials, technologies, metrics, employers, or achievements.
- Prioritize skills and qualities required by the JD only if they are supported by the candidate evidence.
- Summary must be compact and desirable, not a long keyword dump.
Job description:\n${args.request.jobDescription}\nCandidate evidence:\n${JSON.stringify({ profileSummary: args.profile.profileSummary, skills: args.profile.skills, selectedItems: args.items.map((item) => ({ type: item.type, title: item.title, body: item.body })) })}`);
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return { summary: compactWords(typeof source.summary === 'string' ? source.summary : fallback.summary, 58), skills: compactSkillsFallback(typeof source.skills === 'string' ? source.skills : fallback.skills, args.request.jobDescription) };
  } catch {
    return fallback;
  }
}

async function embedResumeFonts(pdf: PDFDocument, textCorpus: string): Promise<Fonts> {
  if (isStandardFontSafe(textCorpus)) {
    const [regular, bold, italic] = await Promise.all([pdf.embedFont(StandardFonts.TimesRoman), pdf.embedFont(StandardFonts.TimesRomanBold), pdf.embedFont(StandardFonts.TimesRomanItalic)]);
    return { regular, bold, italic, usingTimes: true };
  }
  const fonts = await embedNotoSansFonts(pdf, { subset: true });
  return { regular: fonts.regular, bold: fonts.bold, italic: fonts.regular, usingTimes: false };
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(normalizeInline(text), { x, y, size, font, color });
}

function drawRule(page: PDFPage, x1: number, x2: number, y: number, color: RGB, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function drawJustifiedLine(page: PDFPage, line: string, x: number, y: number, width: number, size: number, font: PDFFont, color: RGB, justify: boolean) {
  const clean = normalizeInline(line);
  const words = clean.split(/\s+/).filter(Boolean);
  if (!justify || words.length < 2) { drawText(page, clean, x, y, size, font, color); return; }
  const textWidth = font.widthOfTextAtSize(clean, size);
  if (textWidth >= width || width - textWidth > 35) { drawText(page, clean, x, y, size, font, color); return; }
  const wordsWidth = words.reduce((total, word) => total + font.widthOfTextAtSize(word, size), 0);
  const gap = (width - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const word of words) { drawText(page, word, cursor, y, size, font, color); cursor += font.widthOfTextAtSize(word, size) + gap; }
}

function createDrawContext(args: { pdf: PDFDocument; fonts: Fonts; preset: DensityPreset; accent: RGB }) {
  let page = args.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  const left = args.preset.marginX;
  const right = PAGE_WIDTH - args.preset.marginX;
  const top = PAGE_HEIGHT - args.preset.marginY;
  const bottom = args.preset.marginY;
  let y = top;
  function newPage() { page = args.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); pageNumber += 1; y = top; }
  function ensure(height: number) { if (y - height < bottom) newPage(); }
  function paragraph(text: string, x: number, width: number, size = args.preset.bodySize, font = args.fonts.regular, color = INK, lineHeight = args.preset.lineHeight) {
    const paragraphs = normalizeBody(text).split(/\n\s*\n/).map((block) => normalizeInline(block)).filter(Boolean);
    for (const block of paragraphs) {
      const lines = wrapTextLines(block, font, size, width);
      for (let i = 0; i < lines.length; i += 1) { ensure(lineHeight); drawJustifiedLine(page, lines[i], x, y, width, size, font, color, i < lines.length - 1); y -= lineHeight; }
    }
  }
  function bullets(text: string, x: number, width: number, maxBullets: number) {
    const bulletSize = args.preset.bodySize;
    const marker = '•';
    const indent = args.fonts.regular.widthOfTextAtSize(`${marker} `, bulletSize) + 3;
    for (const bullet of splitBullets(text, maxBullets)) {
      const lines = wrapTextLines(normalizeInline(bullet), args.fonts.regular, bulletSize, Math.max(width - indent, 80));
      if (!lines.length) continue;
      ensure(lines.length * args.preset.lineHeight + args.preset.bulletGap);
      drawText(page, marker, x, y, bulletSize, args.fonts.regular, INK);
      for (let i = 0; i < lines.length; i += 1) { drawJustifiedLine(page, lines[i], x + indent, y, width - indent, bulletSize, args.fonts.regular, INK, i < lines.length - 1); y -= args.preset.lineHeight; }
      y -= args.preset.bulletGap;
    }
  }
  function section(title: string, x = left, width = right - left, rule = true) {
    ensure(args.preset.sectionSize + args.preset.titleSize + args.preset.sectionGap * 2 + 5);
    y -= args.preset.sectionGap;
    drawText(page, title, x, y, args.preset.sectionSize, args.fonts.bold, args.accent);
    y -= args.preset.sectionSize + 1.8;
    if (rule) drawRule(page, x, x + width, y, args.accent, 0.55);
    y -= Math.max(args.preset.titleSize + 1.2, args.preset.bodySize + 1.2, args.preset.sectionGap + 3.5);
  }
  return { get page() { return page; }, get y() { return y; }, set y(value: number) { y = value; }, get pageNumber() { return pageNumber; }, left, right, top, bottom, width: right - left, ensure, newPage, paragraph, bullets, section };
}

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK) {
  const clean = normalizeInline(text);
  const width = font.widthOfTextAtSize(clean, size);
  drawText(page, clean, (PAGE_WIDTH - width) / 2, y, size, font, color);
}

function drawHeaderClassic(ctx: DrawContext, profile: ResumePdfProfile, fonts: Fonts, preset: DensityPreset, accent: RGB) {
  const name = normalizeInline(profile.name) || 'Your Name';
  drawCentered(ctx.page, name, ctx.y, fonts.bold, preset.nameSize, accent);
  ctx.y -= preset.nameSize + 1.5;
  const contact = buildContactLine(profile);
  if (contact) {
    for (const line of wrapTextLines(contact, fonts.regular, preset.contactSize, ctx.width).slice(0, 2)) { drawCentered(ctx.page, line, ctx.y, fonts.regular, preset.contactSize, MUTED); ctx.y -= preset.contactSize + 1.2; }
  }
  ctx.y -= 2.5;
  drawRule(ctx.page, ctx.left, ctx.right, ctx.y, accent, 0.55);
  ctx.y -= Math.max(preset.bodySize + 1.2, 7.8);
}

function drawHeaderLeft(ctx: DrawContext, profile: ResumePdfProfile, fonts: Fonts, preset: DensityPreset, accent: RGB) {
  const name = normalizeInline(profile.name) || 'Your Name';
  drawText(ctx.page, name, ctx.left, ctx.y, preset.nameSize, fonts.bold, accent);
  const contact = buildContactLine(profile);
  if (contact) {
    const lines = wrapTextLines(contact, fonts.regular, preset.contactSize, Math.min(260, ctx.width * 0.48));
    lines.slice(0, 2).forEach((line, index) => drawText(ctx.page, line, ctx.right - fonts.regular.widthOfTextAtSize(line, preset.contactSize), ctx.y - index * (preset.contactSize + 1.2), preset.contactSize, fonts.regular, MUTED));
  }
  ctx.y -= preset.nameSize + 5;
  drawRule(ctx.page, ctx.left, ctx.right, ctx.y, accent, 0.7);
  ctx.y -= 8;
}

function drawTitleLine(ctx: DrawContext, fonts: Fonts, preset: DensityPreset, item: CandidateItem, x: number, width: number, accent: RGB) {
  const metaText = [item.location, item.meta].filter(Boolean).join(' | ');
  const metaWidth = metaText ? fonts.italic.widthOfTextAtSize(metaText, preset.metaSize) : 0;
  const titleWidth = metaText ? width - metaWidth - 12 : width;
  const titleLines = wrapTextLines(item.title, fonts.bold, preset.titleSize, Math.max(80, titleWidth));
  ctx.ensure(titleLines.length * (preset.titleSize + 1.1) + (item.subtitle ? preset.metaSize + 0.5 : 0));
  titleLines.forEach((line, index) => { drawText(ctx.page, line, x, ctx.y, preset.titleSize, fonts.bold, accent); if (index === 0 && metaText) drawText(ctx.page, metaText, x + width - metaWidth, ctx.y, preset.metaSize, fonts.italic, MUTED); ctx.y -= preset.titleSize + 1.1; });
  if (item.subtitle) { drawText(ctx.page, item.subtitle, x, ctx.y + 1.5, preset.metaSize, fonts.italic, INK); ctx.y -= preset.metaSize + 0.5; }
}

function drawEducation(ctx: DrawContext, profile: ResumePdfProfile, fonts: Fonts, preset: DensityPreset, accent: RGB, x = ctx.left, width = ctx.width) {
  if (!profile.school && !profile.major) return;
  ctx.section('Education', x, width);
  const item: CandidateItem = { type: 'experience', index: -1, title: normalizeInline(profile.school) || 'Education', subtitle: normalizeInline(profile.major), meta: normalizeInline(profile.studyPeriod), location: '', body: '', weight: 0 };
  drawTitleLine(ctx, fonts, preset, item, x, width, accent);
  ctx.y -= preset.itemGap;
}

function drawItemList(ctx: DrawContext, fonts: Fonts, preset: DensityPreset, items: CandidateItem[], label: string, x: number, width: number, accent: RGB, card = false) {
  if (!items.length) return;
  ctx.section(label, x, width, !card);
  for (const item of items) {
    if (card) {
      ctx.ensure(36);
      ctx.page.drawRectangle({ x: x - 3, y: ctx.y - 5, width: width + 6, height: preset.titleSize + preset.metaSize + 9, color: PALE, borderColor: RULE, borderWidth: 0.25 });
    }
    drawTitleLine(ctx, fonts, preset, item, x, width, accent);
    ctx.bullets(item.body, x + 1.5, width - 1.5, item.type === 'experience' ? preset.maxExperienceBullets : preset.maxProjectBullets);
    ctx.y -= preset.itemGap;
  }
}

function drawRailSection(page: PDFPage, fonts: Fonts, preset: DensityPreset, title: string, body: string, x: number, y: number, width: number, accent: RGB) {
  const clean = normalizeInline(body);
  if (!clean) return y;
  drawText(page, title.toUpperCase(), x, y, Math.max(6.4, preset.sectionSize - 2.2), fonts.bold, accent);
  y -= preset.lineHeight;
  const lines = wrapTextLines(clean, fonts.regular, Math.max(5.95, preset.bodySize - 0.65), width);
  for (const line of lines.slice(0, 12)) { drawText(page, line, x, y, Math.max(5.95, preset.bodySize - 0.65), fonts.regular, INK); y -= Math.max(6.9, preset.lineHeight - 1.15); }
  return y - 4;
}

function drawTemplate1(args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  drawHeaderClassic(args.ctx, args.profile, args.fonts, args.preset, args.accent);
  if (args.narrative.summary) { args.ctx.section('Summary'); args.ctx.paragraph(args.narrative.summary, args.ctx.left, args.ctx.width); }
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'experience'), 'Professional Experience', args.ctx.left, args.ctx.width, args.accent);
  drawEducation(args.ctx, args.profile, args.fonts, args.preset, args.accent);
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'project'), 'Projects', args.ctx.left, args.ctx.width, args.accent);
  if (args.narrative.skills) { args.ctx.section('Skills'); args.ctx.paragraph(args.narrative.skills, args.ctx.left, args.ctx.width, Math.max(args.preset.bodySize - 0.1, 6.2), args.fonts.regular, INK, args.preset.lineHeight - 0.2); }
  if (args.profile.languages) { args.ctx.section('Languages'); args.ctx.paragraph(args.profile.languages, args.ctx.left, args.ctx.width); }
}

function drawTemplate2(args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  drawHeaderLeft(args.ctx, args.profile, args.fonts, args.preset, args.accent);
  if (args.narrative.skills) {
    args.ctx.page.drawRectangle({ x: args.ctx.left, y: args.ctx.y - 20, width: args.ctx.width, height: 24, color: tintFromAccent(args.accent), borderColor: RULE, borderWidth: 0.25 });
    args.ctx.paragraph(args.narrative.skills, args.ctx.left + 5, args.ctx.width - 10, Math.max(args.preset.bodySize - 0.2, 6.1), args.fonts.regular, INK, args.preset.lineHeight - 0.2);
    args.ctx.y -= 4;
  }
  if (args.narrative.summary) { args.ctx.section('Profile'); args.ctx.paragraph(args.narrative.summary, args.ctx.left, args.ctx.width); }
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'experience'), 'Experience', args.ctx.left, args.ctx.width, args.accent);
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'project'), 'Selected Projects', args.ctx.left, args.ctx.width, args.accent);
  drawEducation(args.ctx, args.profile, args.fonts, args.preset, args.accent);
  if (args.profile.languages) { args.ctx.section('Languages'); args.ctx.paragraph(args.profile.languages, args.ctx.left, args.ctx.width); }
}

function drawTemplate3(args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  const railWidth = 150;
  const railX = args.ctx.left;
  const mainX = railX + railWidth + 18;
  const mainWidth = args.ctx.right - mainX;
  args.ctx.page.drawRectangle({ x: railX - 5, y: args.ctx.bottom, width: railWidth + 10, height: args.ctx.top - args.ctx.bottom, color: SOFT, borderColor: RULE, borderWidth: 0.25 });
  let railY = args.ctx.top - 6;
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Contact', buildContactLine(args.profile), railX + 3, railY, railWidth - 6, args.accent);
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Education', [args.profile.school, args.profile.major, args.profile.studyPeriod].map(normalizeInline).filter(Boolean).join(', '), railX + 3, railY, railWidth - 6, args.accent);
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Skills', args.narrative.skills, railX + 3, railY, railWidth - 6, args.accent);
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Languages', args.profile.languages || '', railX + 3, railY, railWidth - 6, args.accent);
  drawText(args.ctx.page, normalizeInline(args.profile.name) || 'Your Name', mainX, args.ctx.y, args.preset.nameSize + 1, args.fonts.bold, args.accent);
  args.ctx.y -= args.preset.nameSize + 6;
  drawRule(args.ctx.page, mainX, args.ctx.right, args.ctx.y, args.accent, 0.7);
  args.ctx.y -= 9;
  if (args.narrative.summary) { args.ctx.section('Profile', mainX, mainWidth); args.ctx.paragraph(args.narrative.summary, mainX, mainWidth); }
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'experience'), 'Experience', mainX, mainWidth, args.accent);
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'project'), 'Projects', mainX, mainWidth, args.accent);
}

function drawTemplate4(args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  const bannerHeight = 54;
  args.ctx.page.drawRectangle({ x: args.ctx.left, y: args.ctx.y - bannerHeight + 8, width: args.ctx.width, height: bannerHeight, color: args.accent });
  drawText(args.ctx.page, normalizeInline(args.profile.name) || 'Your Name', args.ctx.left + 12, args.ctx.y - 11, args.preset.nameSize, args.fonts.bold, WHITE);
  const contact = buildContactLine(args.profile);
  if (contact) args.ctx.paragraph(contact, args.ctx.left + 12, args.ctx.width - 24, args.preset.contactSize, args.fonts.regular, WHITE, args.preset.contactSize + 1.1);
  args.ctx.y -= bannerHeight + 3;
  if (args.narrative.summary) { args.ctx.section('Executive Summary', args.ctx.left, args.ctx.width, false); args.ctx.paragraph(args.narrative.summary, args.ctx.left, args.ctx.width); }
  if (args.narrative.skills) {
    args.ctx.section('Capability Stack', args.ctx.left, args.ctx.width, false);
    args.ctx.page.drawRectangle({ x: args.ctx.left - 2, y: args.ctx.y - 16, width: args.ctx.width + 4, height: 20, color: tintFromAccent(args.accent), borderColor: RULE, borderWidth: 0.25 });
    args.ctx.paragraph(args.narrative.skills, args.ctx.left + 3, args.ctx.width - 6, Math.max(args.preset.bodySize - 0.15, 6.2), args.fonts.regular, INK, args.preset.lineHeight - 0.2);
    args.ctx.y -= 3;
  }
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'experience'), 'Experience Cards', args.ctx.left, args.ctx.width, args.accent, true);
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'project'), 'Project Cards', args.ctx.left, args.ctx.width, args.accent, true);
  drawEducation(args.ctx, args.profile, args.fonts, args.preset, args.accent);
}

function drawTemplate5(args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  drawText(args.ctx.page, normalizeInline(args.profile.name) || 'Your Name', args.ctx.left, args.ctx.y, args.preset.nameSize + 1.5, args.fonts.bold, args.accent);
  args.ctx.y -= args.preset.nameSize + 4;
  const bandHeight = 24;
  args.ctx.page.drawRectangle({ x: args.ctx.left, y: args.ctx.y - bandHeight + 5, width: args.ctx.width, height: bandHeight, color: tintFromAccent(args.accent), borderColor: RULE, borderWidth: 0.25 });
  args.ctx.paragraph(args.narrative.skills, args.ctx.left + 7, args.ctx.width - 14, Math.max(args.preset.bodySize - 0.25, 6.1), args.fonts.regular, INK, args.preset.lineHeight - 0.3);
  args.ctx.y -= 6;
  const railWidth = 136;
  const mainWidth = args.ctx.width - railWidth - 18;
  const railX = args.ctx.left + mainWidth + 18;
  let railY = args.ctx.y;
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Contact', buildContactLine(args.profile), railX, railY, railWidth, args.accent);
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Education', [args.profile.school, args.profile.major, args.profile.studyPeriod].map(normalizeInline).filter(Boolean).join(', '), railX, railY, railWidth, args.accent);
  railY = drawRailSection(args.ctx.page, args.fonts, args.preset, 'Languages', args.profile.languages || '', railX, railY, railWidth, args.accent);
  if (args.narrative.summary) { args.ctx.section('Profile Ledger', args.ctx.left, mainWidth); args.ctx.paragraph(args.narrative.summary, args.ctx.left, mainWidth); }
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'experience'), 'Career Ledger', args.ctx.left, mainWidth, args.accent);
  drawItemList(args.ctx, args.fonts, args.preset, args.items.filter((item) => item.type === 'project'), 'Technical Proof', args.ctx.left, mainWidth, args.accent);
}

function drawResumeLayout(args: { template: ResumeTemplateId; ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }) {
  if (args.template === 'style2') return drawTemplate2(args);
  if (args.template === 'style3') return drawTemplate3(args);
  if (args.template === 'style4') return drawTemplate4(args);
  if (args.template === 'style5') return drawTemplate5(args);
  return drawTemplate1(args);
}

async function renderAttempt(args: { template: ResumeTemplateId; profile: ResumePdfProfile; request: ResumeRenderRequest; items: CandidateItem[]; density: DensityPreset; enhancedSkills?: string; narrative?: PreparedNarrative }): Promise<RenderAttempt> {
  const preset = applyStylePreferenceDensity(args.density, args.request.stylePreferences);
  const narrative = args.narrative || { summary: compactSummaryFallback(args.profile, args.request.jobDescription), skills: compactSkillsFallback(resolveResumeSkillsText(args.enhancedSkills, args.request.skills, args.profile.skills), args.request.jobDescription) };
  const textCorpus = [args.profile.name, buildContactLine(args.profile), narrative.summary, narrative.skills, args.profile.languages, args.profile.major, args.profile.school, ...args.items.flatMap((item) => [item.title, item.subtitle, item.meta, item.location, item.body])].filter(Boolean).join('\n');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${normalizeInline(args.profile.name) || 'Candidate'} Resume`);
  pdf.setSubject('ATS-optimized resume');
  pdf.setCreator('CV Assistant');
  pdf.setProducer('CV Assistant');
  const fonts = await embedResumeFonts(pdf, textCorpus);
  const accent = accentColor(args.request.stylePreferences?.accentColor);
  const ctx = createDrawContext({ pdf, fonts, preset, accent });
  drawResumeLayout({ template: args.template, ctx, fonts, preset, profile: args.profile, items: args.items, narrative, accent });
  const pageCount = pdf.getPageCount();
  const usableHeight = PAGE_HEIGHT - preset.marginY * 2;
  const lastPageFillRatio = Math.max(0, Math.min(1, (ctx.top - ctx.y) / usableHeight));
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes, pageCount, lastPageFillRatio, density: preset, items: args.items, usingTimes: fonts.usingTimes };
}

function dropWeakestItem(items: CandidateItem[]) {
  const projectIndex = [...items].map((item, index) => ({ item, index })).reverse().find(({ item }) => item.type === 'project')?.index;
  if (projectIndex !== undefined) return items.filter((_, index) => index !== projectIndex);
  return items.slice(0, Math.max(1, items.length - 1));
}

async function truncateToTwoPages(bytes: Uint8Array) {
  const source = await PDFDocument.load(bytes);
  if (source.getPageCount() <= MAX_PAGES) return bytes;
  const target = await PDFDocument.create();
  const copied = await target.copyPages(source, [0, 1]);
  copied.forEach((page) => target.addPage(page));
  return target.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function renderResumePdf(args: { template: ResumeTemplateId; profile: ResumePdfProfile; request: ResumeRenderRequest }): Promise<ResumePdfResult> {
  const enhanced = await maybeEnhanceContent({ profile: args.profile, request: args.request });
  let items = collectItems({ profile: args.profile, request: args.request, enhancedProjects: enhanced.enhancedProjects, enhancedExperiences: enhanced.enhancedExperiences });
  items.sort((a, b) => b.weight - a.weight);
  const backfill = args.request.autoFit ? collectBackfillItems(args.profile, items) : [];
  const narrative = await maybePrepareNarrative({ profile: args.profile, request: args.request, enhancedSkills: enhanced.enhancedSkills, items });
  let best: RenderAttempt | null = null;
  for (let cycle = 0; cycle < 40; cycle += 1) {
    for (const density of DENSITIES) {
      const attempt = await renderAttempt({ template: args.template, profile: args.profile, request: args.request, items, density, enhancedSkills: enhanced.enhancedSkills, narrative });
      best = !best || attempt.pageCount < best.pageCount || attempt.bytes.length < best.bytes.length ? attempt : best;
      if (attempt.pageCount <= MAX_PAGES) {
        if (args.request.autoFit && attempt.lastPageFillRatio < TARGET_MIN_LAST_PAGE_FILL && backfill.length > 0) {
          const candidate = backfill.shift();
          if (candidate) {
            const expanded = [...items, candidate].sort((a, b) => b.weight - a.weight);
            const expandedAttempt = await renderAttempt({ template: args.template, profile: args.profile, request: args.request, items: expanded, density, enhancedSkills: enhanced.enhancedSkills, narrative });
            if (expandedAttempt.pageCount <= MAX_PAGES) { items = expanded; best = expandedAttempt; continue; }
          }
        }
        const atsText = [args.profile.name, args.profile.major, args.profile.school, narrative.summary, narrative.skills, ...items.flatMap((item) => [item.title, item.subtitle, item.location, item.body])].join(' ');
        return { bytes: attempt.bytes, telemetry: { pageCount: attempt.pageCount, density: attempt.density.key, atsScore: scoreAts(atsText, args.request.jobDescription, attempt.pageCount), selectedExperiences: items.filter((item) => item.type === 'experience').length, selectedProjects: items.filter((item) => item.type === 'project').length, finalItemCount: items.length, lastPageFillRatio: attempt.lastPageFillRatio, usingTimes: attempt.usingTimes, truncatedToTwoPages: false } };
      }
    }
    if (items.length <= 1) break;
    items = dropWeakestItem(items);
  }
  const fallback = best || await renderAttempt({ template: args.template, profile: args.profile, request: args.request, items, density: DENSITIES[DENSITIES.length - 1], enhancedSkills: enhanced.enhancedSkills, narrative });
  const finalBytes = fallback.pageCount > MAX_PAGES ? await truncateToTwoPages(fallback.bytes) : fallback.bytes;
  const finalPageCount = fallback.pageCount > MAX_PAGES ? MAX_PAGES : fallback.pageCount;
  const atsText = [args.profile.name, args.profile.major, args.profile.school, narrative.summary, narrative.skills, ...items.flatMap((item) => [item.title, item.subtitle, item.location, item.body])].join(' ');
  return { bytes: finalBytes, telemetry: { pageCount: finalPageCount, density: fallback.density.key, atsScore: scoreAts(atsText, args.request.jobDescription, finalPageCount), selectedExperiences: items.filter((item) => item.type === 'experience').length, selectedProjects: items.filter((item) => item.type === 'project').length, finalItemCount: items.length, lastPageFillRatio: fallback.lastPageFillRatio, usingTimes: fallback.usingTimes, truncatedToTwoPages: fallback.pageCount > MAX_PAGES } };
}
