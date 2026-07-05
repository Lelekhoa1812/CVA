import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { getModel } from '@/lib/ai';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { formatResumeProfileParagraph, resolveResumeProfileText } from '@/lib/resume/profile';
import { formatResumeSkillsParagraph, resolveResumeSkillsText } from '@/lib/resume/skills';
import { stripMarkdownForPdf, wrapTextLines } from '@/app/api/resume/pdf-layout';

export type ResumeTemplateId = 'style1' | 'style2' | 'style3' | 'style4' | 'style5';

type Project = { name?: string; summary?: string; description?: string };
type Experience = {
  companyName?: string;
  role?: string;
  summary?: string;
  description?: string;
  timeFrom?: string;
  timeTo?: string;
};

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

type StylePreferences = {
  fontSize?: string;
  useBold?: boolean;
  contentDensity?: string;
  accentColor?: 'black' | 'dark-blue' | 'dark-gray' | 'crimson' | 'dark-green';
};

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

type DensityPreset = {
  key: 'professional' | 'compact' | 'micro';
  marginX: number;
  marginY: number;
  nameSize: number;
  contactSize: number;
  sectionSize: number;
  titleSize: number;
  metaSize: number;
  bodySize: number;
  lineHeight: number;
  sectionGap: number;
  itemGap: number;
  bulletGap: number;
  maxExperienceBullets: number;
  maxProjectBullets: number;
};

type CandidateItem = {
  type: 'experience' | 'project';
  index: number;
  title: string;
  meta: string;
  body: string;
  weight: number;
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; usingTimes: boolean };

type RenderAttempt = {
  bytes: Uint8Array;
  pageCount: number;
  lastPageFillRatio: number;
  density: DensityPreset;
  selectedItems: CandidateItem[];
  usingTimes: boolean;
};

export type ResumePdfResult = {
  bytes: Uint8Array;
  telemetry: {
    pageCount: number;
    density: string;
    atsScore: number;
    selectedExperiences: number;
    selectedProjects: number;
    finalItemCount: number;
    lastPageFillRatio: number;
    usingTimes: boolean;
    truncatedToTwoPages: boolean;
  };
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MAX_PAGES = 2;
const TARGET_MIN_LAST_PAGE_FILL = 0.62;
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.34, 0.34, 0.34);
const RULE = rgb(0.72, 0.72, 0.72);
const SOFT = rgb(0.965, 0.965, 0.965);

const DENSITIES: DensityPreset[] = [
  {
    key: 'professional',
    marginX: 38,
    marginY: 34,
    nameSize: 18,
    contactSize: 8.1,
    sectionSize: 10.2,
    titleSize: 9.9,
    metaSize: 8.5,
    bodySize: 8.9,
    lineHeight: 10.9,
    sectionGap: 6,
    itemGap: 4,
    bulletGap: 1.3,
    maxExperienceBullets: 3,
    maxProjectBullets: 2,
  },
  {
    key: 'compact',
    marginX: 34,
    marginY: 30,
    nameSize: 17,
    contactSize: 7.8,
    sectionSize: 9.8,
    titleSize: 9.4,
    metaSize: 8.1,
    bodySize: 8.45,
    lineHeight: 10.2,
    sectionGap: 4.8,
    itemGap: 3,
    bulletGap: 1,
    maxExperienceBullets: 2,
    maxProjectBullets: 2,
  },
  {
    key: 'micro',
    marginX: 30,
    marginY: 27,
    nameSize: 16,
    contactSize: 7.35,
    sectionSize: 9.3,
    titleSize: 9,
    metaSize: 7.8,
    bodySize: 8.05,
    lineHeight: 9.55,
    sectionGap: 3.8,
    itemGap: 2.2,
    bulletGap: 0.6,
    maxExperienceBullets: 2,
    maxProjectBullets: 1,
  },
];

function normalizeText(value?: string | null) {
  return (value || '')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isStandardFontSafe(value: string) {
  return [...value].every((char) => char.charCodeAt(0) <= 255);
}

function accentColor(key?: string): RGB {
  if (key === 'dark-blue') return rgb(0.05, 0.16, 0.33);
  if (key === 'dark-gray') return rgb(0.16, 0.16, 0.16);
  if (key === 'crimson') return rgb(0.48, 0.06, 0.10);
  if (key === 'dark-green') return rgb(0.05, 0.26, 0.14);
  return rgb(0.04, 0.04, 0.04);
}

function parsePreferredBodySize(stylePreferences?: StylePreferences | null) {
  const raw = stylePreferences?.fontSize || '';
  const match = raw.match(/(\d+(?:\.\d+)?)pt/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(8, Math.min(10.5, parsed - 1));
}

function applyStylePreferenceDensity(preset: DensityPreset, stylePreferences?: StylePreferences | null): DensityPreset {
  const preferredBody = parsePreferredBodySize(stylePreferences);
  if (!preferredBody) return preset;
  const delta = preferredBody - preset.bodySize;
  return {
    ...preset,
    bodySize: preferredBody,
    lineHeight: Math.max(preferredBody + 1.25, preset.lineHeight + delta),
    titleSize: Math.max(preferredBody + 0.45, preset.titleSize + delta * 0.5),
    sectionSize: Math.max(preferredBody + 0.9, preset.sectionSize + delta * 0.5),
  };
}

function splitBullets(text: string, maxBullets: number): string[] {
  const cleaned = stripMarkdownForPdf(text || '')
    .replace(/[—–]/g, '-')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[•\-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  const bullets = lines.length > 1 ? lines : cleaned.split(/(?<=[.!?])\s+(?=[A-Z])/).map((line) => line.trim()).filter(Boolean);
  return (bullets.length ? bullets : [cleaned]).slice(0, maxBullets);
}

function buildContactLine(profile: ResumePdfProfile) {
  const preferredEmail = normalizeText(profile.workEmail) || normalizeText(profile.email);
  return [preferredEmail, profile.phone, profile.website, profile.linkedin]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(' | ');
}

function deriveKeywords(jobDescription?: string) {
  const stop = new Set([
    'and', 'the', 'for', 'with', 'you', 'our', 'will', 'are', 'this', 'that', 'from', 'have', 'has', 'your', 'role', 'work', 'team', 'job', 'about', 'into', 'using', 'use', 'their', 'they', 'who', 'can', 'all', 'more', 'such', 'than', 'then', 'been', 'but', 'not', 'we', 'as', 'in', 'on', 'to', 'of', 'a', 'an', 'is', 'be', 'or', 'at', 'by'
  ]);
  return [...new Set((jobDescription || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9+#.\-]{2,}/g)?.filter((word) => !stop.has(word)) || [])]
    .slice(0, 60);
}

function scoreAts(text: string, jobDescription?: string, pages = 1) {
  const keywords = deriveKeywords(jobDescription);
  if (!keywords.length) return pages <= 2 ? 82 : 62;
  const body = text.toLowerCase();
  const matched = keywords.filter((keyword) => body.includes(keyword));
  const coverage = matched.length / keywords.length;
  const pagePenalty = pages > 2 ? 25 : 0;
  return Math.max(0, Math.min(100, Math.round(50 + coverage * 50 - pagePenalty)));
}

function collectItems(args: {
  profile: ResumePdfProfile;
  request: ResumeRenderRequest;
  enhancedProjects: Record<number, string>;
  enhancedExperiences: Record<number, string>;
}) {
  const contentEnhancementData = args.request.contentEnhancementData || {};
  const experiences = (args.profile.experiences || [])
    .map((experience, index) => ({ experience, index }))
    .filter(({ index }) => args.request.selectedExperiences.includes(index))
    .map(({ experience, index }) => {
      const title = [experience.companyName, experience.role].map(normalizeText).filter(Boolean).join(' - ') || 'Experience';
      const meta = [experience.timeFrom, experience.timeTo].map(normalizeText).filter(Boolean).join(' to ');
      const body = normalizeText(
        contentEnhancementData[`experience-${index}`] ||
        args.enhancedExperiences[index] ||
        experience.description ||
        experience.summary,
      );
      return { type: 'experience' as const, index, title, meta, body, weight: 1000 - index };
    });

  const projects = (args.profile.projects || [])
    .map((project, index) => ({ project, index }))
    .filter(({ index }) => args.request.selectedProjects.includes(index))
    .map(({ project, index }) => {
      const body = normalizeText(
        contentEnhancementData[`project-${index}`] ||
        args.enhancedProjects[index] ||
        project.description ||
        project.summary,
      );
      return { type: 'project' as const, index, title: normalizeText(project.name) || 'Project', meta: 'Project', body, weight: 400 - index };
    });

  return [...experiences, ...projects].filter((item) => item.title || item.body);
}

function collectBackfillItems(profile: ResumePdfProfile, selected: CandidateItem[]) {
  const selectedKeys = new Set(selected.map((item) => `${item.type}-${item.index}`));
  const experiences = (profile.experiences || []).map((experience, index) => ({
    type: 'experience' as const,
    index,
    title: [experience.companyName, experience.role].map(normalizeText).filter(Boolean).join(' - ') || 'Experience',
    meta: [experience.timeFrom, experience.timeTo].map(normalizeText).filter(Boolean).join(' to '),
    body: normalizeText(experience.description || experience.summary),
    weight: 850 - index,
  }));
  const projects = (profile.projects || []).map((project, index) => ({
    type: 'project' as const,
    index,
    title: normalizeText(project.name) || 'Project',
    meta: 'Project',
    body: normalizeText(project.description || project.summary),
    weight: 300 - index,
  }));

  return [...experiences, ...projects]
    .filter((item) => !selectedKeys.has(`${item.type}-${item.index}`) && (item.title || item.body))
    .sort((a, b) => b.weight - a.weight);
}

async function maybeEnhanceContent(args: {
  profile: ResumePdfProfile;
  request: ResumeRenderRequest;
}) {
  const enhancedSkills = { value: undefined as string | undefined };
  const enhancedProjects: Record<number, string> = {};
  const enhancedExperiences: Record<number, string> = {};

  if (!args.request.enhance) return { enhancedSkills: enhancedSkills.value, enhancedProjects, enhancedExperiences };

  try {
    const model = getModel('hard');
    const jd = args.request.jobDescription ? `\nTarget job description:\n${args.request.jobDescription}` : '';
    const qaNotes = Array.isArray(args.request.qa) && args.request.qa.length
      ? `\nUser coaching notes:\n${args.request.qa.map((m) => `[${m.role}] ${m.content}`).join('\n')}`
      : '';
    async function improve(prompt: string) {
      const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      return res.response.text().trim();
    }

    if (args.request.skills) {
      enhancedSkills.value = await improve(`Rewrite these resume skills into one dense ATS-friendly comma-separated line. Do not invent skills.${jd}${qaNotes}\nSkills:\n${args.request.skills}`);
    }

    for (const idx of args.request.selectedExperiences) {
      const experience = args.profile.experiences?.[idx];
      if (!experience) continue;
      const source = experience.description || experience.summary || '';
      if (!source.trim()) continue;
      enhancedExperiences[idx] = await improve(`Rewrite this work experience into 2-3 dense Times-style resume bullets for the target role. Preserve only supported facts and technologies. Return plain newline bullets only.${jd}${qaNotes}\nCompany: ${experience.companyName || ''}\nRole: ${experience.role || ''}\nSource:\n${source}`);
    }

    for (const idx of args.request.selectedProjects) {
      const project = args.profile.projects?.[idx];
      if (!project) continue;
      const source = project.description || project.summary || '';
      if (!source.trim()) continue;
      enhancedProjects[idx] = await improve(`Rewrite this project into 1-2 dense ATS-friendly resume bullets for the target role. Preserve only supported facts and technologies. Return plain newline bullets only.${jd}${qaNotes}\nProject: ${project.name || ''}\nSource:\n${source}`);
    }
  } catch (error) {
    console.warn('Shared resume enhancement skipped:', error);
  }

  return { enhancedSkills: enhancedSkills.value, enhancedProjects, enhancedExperiences };
}

async function embedResumeFonts(pdf: PDFDocument, textCorpus: string): Promise<Fonts> {
  if (isStandardFontSafe(textCorpus)) {
    const [regular, bold, italic] = await Promise.all([
      pdf.embedFont(StandardFonts.TimesRoman),
      pdf.embedFont(StandardFonts.TimesRomanBold),
      pdf.embedFont(StandardFonts.TimesRomanItalic),
    ]);
    return { regular, bold, italic, usingTimes: true };
  }

  const fonts = await embedNotoSansFonts(pdf, { subset: true });
  return { regular: fonts.regular, bold: fonts.bold, italic: fonts.regular, usingTimes: false };
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(normalizeText(text), { x, y, size, font, color });
}

function drawRule(page: PDFPage, x1: number, x2: number, y: number, color: RGB, thickness = 0.55) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function createDrawContext(args: {
  pdf: PDFDocument;
  fonts: Fonts;
  preset: DensityPreset;
  template: ResumeTemplateId;
  accent: RGB;
}) {
  let page = args.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  const left = args.preset.marginX;
  const right = PAGE_WIDTH - args.preset.marginX;
  const top = PAGE_HEIGHT - args.preset.marginY;
  const bottom = args.preset.marginY;
  let y = top;

  function pageChrome() {
    if (pageNumber > 1) {
      drawRule(page, left, right, top + 5, RULE, 0.4);
    }
  }

  function newPage() {
    page = args.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    y = top;
    pageChrome();
  }

  function ensure(height: number) {
    if (y - height < bottom) newPage();
  }

  function drawWrapped(text: string, x: number, width: number, size = args.preset.bodySize, font = args.fonts.regular, color = INK, lineHeight = args.preset.lineHeight) {
    const lines = wrapTextLines(normalizeText(text), font, size, width);
    for (const line of lines) {
      ensure(lineHeight);
      drawText(page, line, x, y, size, font, color);
      y -= lineHeight;
    }
    return lines.length;
  }

  function drawBullets(text: string, x: number, width: number, maxBullets: number) {
    const bullets = splitBullets(text, maxBullets);
    const bulletSize = args.preset.bodySize;
    const lineHeight = args.preset.lineHeight;
    const marker = '-';
    const indent = args.fonts.regular.widthOfTextAtSize(`${marker} `, bulletSize) + 3;
    for (const bullet of bullets) {
      const lines = wrapTextLines(bullet, args.fonts.regular, bulletSize, Math.max(width - indent, 80));
      if (!lines.length) continue;
      ensure(lines.length * lineHeight + args.preset.bulletGap);
      drawText(page, marker, x, y, bulletSize, args.fonts.regular, INK);
      for (const line of lines) {
        drawText(page, line, x + indent, y, bulletSize, args.fonts.regular, INK);
        y -= lineHeight;
      }
      y -= args.preset.bulletGap;
    }
  }

  function section(title: string, x = left, width = right - left) {
    ensure(args.preset.sectionSize + args.preset.sectionGap + 4);
    y -= args.preset.sectionGap;
    drawText(page, title.toUpperCase(), x, y, args.preset.sectionSize, args.fonts.bold, args.accent);
    y -= args.preset.sectionSize * 0.55;
    drawRule(page, x, x + width, y, args.accent, 0.65);
    y -= args.preset.sectionGap;
  }

  return {
    get page() { return page; },
    get y() { return y; },
    set y(value: number) { y = value; },
    get pageNumber() { return pageNumber; },
    left,
    right,
    top,
    bottom,
    width: right - left,
    ensure,
    newPage,
    drawWrapped,
    drawBullets,
    section,
  };
}

function drawHeader(ctx: ReturnType<typeof createDrawContext>, profile: ResumePdfProfile, fonts: Fonts, preset: DensityPreset, accent: RGB) {
  const name = normalizeText(profile.name) || 'Your Name';
  const nameWidth = fonts.bold.widthOfTextAtSize(name, preset.nameSize);
  drawText(ctx.page, name, (PAGE_WIDTH - nameWidth) / 2, ctx.y, preset.nameSize, fonts.bold, accent);
  ctx.y -= preset.nameSize + 2.5;

  const contact = buildContactLine(profile);
  if (contact) {
    const lines = wrapTextLines(contact, fonts.regular, preset.contactSize, ctx.width);
    for (const line of lines.slice(0, 2)) {
      const lineWidth = fonts.regular.widthOfTextAtSize(line, preset.contactSize);
      drawText(ctx.page, line, (PAGE_WIDTH - lineWidth) / 2, ctx.y, preset.contactSize, fonts.regular, MUTED);
      ctx.y -= preset.contactSize + 2;
    }
  }
  ctx.y -= 4;
  drawRule(ctx.page, ctx.left, ctx.right, ctx.y, accent, 0.8);
  ctx.y -= 6;
}

function drawTitleMeta(ctx: ReturnType<typeof createDrawContext>, fonts: Fonts, preset: DensityPreset, title: string, meta: string, x: number, width: number, color = INK) {
  const metaText = normalizeText(meta);
  const metaWidth = metaText ? fonts.italic.widthOfTextAtSize(metaText, preset.metaSize) : 0;
  const titleWidth = metaText ? width - metaWidth - 12 : width;
  const titleLines = wrapTextLines(title, fonts.bold, preset.titleSize, titleWidth);
  ctx.ensure(titleLines.length * (preset.titleSize + 1.8) + 4);
  titleLines.forEach((line, index) => {
    drawText(ctx.page, line, x, ctx.y, preset.titleSize, fonts.bold, color);
    if (index === 0 && metaText) {
      drawText(ctx.page, metaText, x + width - metaWidth, ctx.y, preset.metaSize, fonts.italic, MUTED);
    }
    ctx.y -= preset.titleSize + 1.8;
  });
}

function drawClassicLayout(args: {
  template: ResumeTemplateId;
  ctx: ReturnType<typeof createDrawContext>;
  fonts: Fonts;
  preset: DensityPreset;
  profile: ResumePdfProfile;
  items: CandidateItem[];
  skillsText: string;
  profileText: string;
  accent: RGB;
}) {
  drawHeader(args.ctx, args.profile, args.fonts, args.preset, args.accent);

  if (args.profile.school || args.profile.major) {
    args.ctx.section('Education');
    drawTitleMeta(
      args.ctx,
      args.fonts,
      args.preset,
      normalizeText(args.profile.school) || 'Education',
      normalizeText(args.profile.studyPeriod),
      args.ctx.left,
      args.ctx.width,
      INK,
    );
    if (args.profile.major) args.ctx.drawWrapped(args.profile.major, args.ctx.left, args.ctx.width, args.preset.bodySize, args.fonts.regular, INK);
  }

  if (args.profileText) {
    args.ctx.section('Profile');
    args.ctx.drawWrapped(args.profileText, args.ctx.left, args.ctx.width, args.preset.bodySize, args.fonts.regular, INK);
  }

  if (args.skillsText) {
    args.ctx.section('Skills');
    args.ctx.drawWrapped(args.skillsText, args.ctx.left, args.ctx.width, Math.max(args.preset.bodySize - 0.2, 7.8), args.fonts.regular, INK, args.preset.lineHeight - 0.2);
  }

  if (args.profile.languages) {
    args.ctx.section('Languages');
    args.ctx.drawWrapped(args.profile.languages, args.ctx.left, args.ctx.width, args.preset.bodySize, args.fonts.regular, INK);
  }

  const experiences = args.items.filter((item) => item.type === 'experience');
  if (experiences.length) {
    args.ctx.section('Experience');
    for (const item of experiences) {
      drawTitleMeta(args.ctx, args.fonts, args.preset, item.title, item.meta, args.ctx.left, args.ctx.width, args.accent);
      args.ctx.drawBullets(item.body, args.ctx.left, args.ctx.width, args.preset.maxExperienceBullets);
      args.ctx.y -= args.preset.itemGap;
    }
  }

  const projects = args.items.filter((item) => item.type === 'project');
  if (projects.length) {
    args.ctx.section('Projects');
    for (const item of projects) {
      drawTitleMeta(args.ctx, args.fonts, args.preset, item.title, '', args.ctx.left, args.ctx.width, args.accent);
      args.ctx.drawBullets(item.body, args.ctx.left, args.ctx.width, args.preset.maxProjectBullets);
      args.ctx.y -= args.preset.itemGap;
    }
  }
}

function drawSidebarLayout(args: {
  template: ResumeTemplateId;
  ctx: ReturnType<typeof createDrawContext>;
  fonts: Fonts;
  preset: DensityPreset;
  profile: ResumePdfProfile;
  items: CandidateItem[];
  skillsText: string;
  profileText: string;
  accent: RGB;
}) {
  const railWidth = args.template === 'style5' ? 148 : 156;
  const gap = 16;
  const mainLeft = args.ctx.left + railWidth + gap;
  const mainWidth = args.ctx.right - mainLeft;
  const railX = args.ctx.left;
  const railMax = railWidth;

  const name = normalizeText(args.profile.name) || 'Your Name';
  drawText(args.ctx.page, name, mainLeft, args.ctx.y, args.preset.nameSize + 1, args.fonts.bold, args.accent);
  args.ctx.y -= args.preset.nameSize + 5;
  drawRule(args.ctx.page, mainLeft, args.ctx.right, args.ctx.y, args.accent, 0.8);
  args.ctx.y -= 8;

  let railY = PAGE_HEIGHT - args.preset.marginY;
  args.ctx.page.drawRectangle({ x: railX - 4, y: args.ctx.bottom, width: railWidth + 8, height: args.ctx.top - args.ctx.bottom + 4, color: SOFT, borderColor: RULE, borderWidth: 0.35 });

  function railSection(title: string, values: string[]) {
    const clean = values.map(normalizeText).filter(Boolean);
    if (!clean.length) return;
    drawText(args.ctx.page, title.toUpperCase(), railX + 6, railY, args.preset.sectionSize - 0.7, args.fonts.bold, args.accent);
    railY -= args.preset.sectionSize + 3;
    for (const value of clean) {
      const lines = wrapTextLines(value, args.fonts.regular, Math.max(args.preset.bodySize - 0.4, 7.6), railMax - 12);
      for (const line of lines) {
        drawText(args.ctx.page, line, railX + 6, railY, Math.max(args.preset.bodySize - 0.4, 7.6), args.fonts.regular, INK);
        railY -= args.preset.lineHeight - 0.5;
      }
    }
    railY -= 7;
  }

  railSection('Contact', [buildContactLine(args.profile)]);
  railSection('Education', [[args.profile.school, args.profile.major].map(normalizeText).filter(Boolean).join(', '), args.profile.studyPeriod || '']);
  railSection('Skills', [args.skillsText]);
  railSection('Languages', [args.profile.languages || '']);

  if (args.profileText) {
    args.ctx.section('Profile', mainLeft, mainWidth);
    args.ctx.drawWrapped(args.profileText, mainLeft, mainWidth, args.preset.bodySize, args.fonts.regular, INK);
  }

  const experiences = args.items.filter((item) => item.type === 'experience');
  if (experiences.length) {
    args.ctx.section('Experience', mainLeft, mainWidth);
    for (const item of experiences) {
      drawTitleMeta(args.ctx, args.fonts, args.preset, item.title, item.meta, mainLeft, mainWidth, args.accent);
      args.ctx.drawBullets(item.body, mainLeft, mainWidth, args.preset.maxExperienceBullets);
      args.ctx.y -= args.preset.itemGap;
    }
  }

  const projects = args.items.filter((item) => item.type === 'project');
  if (projects.length) {
    args.ctx.section('Projects', mainLeft, mainWidth);
    for (const item of projects) {
      drawTitleMeta(args.ctx, args.fonts, args.preset, item.title, '', mainLeft, mainWidth, args.accent);
      args.ctx.drawBullets(item.body, mainLeft, mainWidth, args.preset.maxProjectBullets);
      args.ctx.y -= args.preset.itemGap;
    }
  }
}

function drawModernTwoColumnLayout(args: {
  ctx: ReturnType<typeof createDrawContext>;
  fonts: Fonts;
  preset: DensityPreset;
  profile: ResumePdfProfile;
  items: CandidateItem[];
  skillsText: string;
  profileText: string;
  accent: RGB;
}) {
  drawHeader(args.ctx, args.profile, args.fonts, args.preset, args.accent);

  const gap = 18;
  const colWidth = (args.ctx.width - gap) / 2;
  const colX = [args.ctx.left, args.ctx.left + colWidth + gap];
  const originalEnsure = args.ctx.ensure;
  let colY = [args.ctx.y, args.ctx.y];

  function drawSmallSection(title: string, text: string) {
    if (!text) return;
    args.ctx.section(title);
    args.ctx.drawWrapped(text, args.ctx.left, args.ctx.width, args.preset.bodySize, args.fonts.regular, INK);
  }

  drawSmallSection('Profile', args.profileText);
  drawSmallSection('Skills', args.skillsText);

  function drawItemInColumn(item: CandidateItem, col: 0 | 1) {
    args.ctx.y = colY[col];
    const x = colX[col];
    const maxWidth = colWidth;
    const titleColor = item.type === 'experience' ? args.accent : INK;
    drawTitleMeta(args.ctx, args.fonts, args.preset, item.title, item.meta, x, maxWidth, titleColor);
    args.ctx.drawBullets(item.body, x, maxWidth, item.type === 'experience' ? args.preset.maxExperienceBullets : args.preset.maxProjectBullets);
    args.ctx.y -= args.preset.itemGap;
    colY[col] = args.ctx.y;
  }

  const sections = [
    { label: 'Experience', items: args.items.filter((item) => item.type === 'experience') },
    { label: 'Projects', items: args.items.filter((item) => item.type === 'project') },
  ];

  for (const section of sections) {
    if (!section.items.length) continue;
    args.ctx.y = Math.min(colY[0], colY[1]) - 2;
    args.ctx.section(section.label);
    colY = [args.ctx.y, args.ctx.y];
    let nextCol: 0 | 1 = 0;
    for (const item of section.items) {
      if (Math.min(colY[0], colY[1]) < args.ctx.bottom + 65) {
        args.ctx.newPage();
        colY = [args.ctx.y, args.ctx.y];
      }
      nextCol = colY[0] >= colY[1] ? 0 : 1;
      drawItemInColumn(item, nextCol);
    }
    args.ctx.y = Math.min(colY[0], colY[1]) - 4;
  }

  originalEnsure(1);
}

async function renderAttempt(args: {
  template: ResumeTemplateId;
  profile: ResumePdfProfile;
  request: ResumeRenderRequest;
  items: CandidateItem[];
  density: DensityPreset;
  enhancedSkills?: string;
}) : Promise<RenderAttempt> {
  const preset = applyStylePreferenceDensity(args.density, args.request.stylePreferences);
  const profileText = formatResumeProfileParagraph(resolveResumeProfileText(args.profile.profileSummary));
  const skillsText = formatResumeSkillsParagraph(resolveResumeSkillsText(args.enhancedSkills, args.request.skills, args.profile.skills));
  const textCorpus = [
    args.profile.name,
    buildContactLine(args.profile),
    profileText,
    skillsText,
    args.profile.languages,
    ...args.items.flatMap((item) => [item.title, item.meta, item.body]),
  ].filter(Boolean).join('\n');

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${normalizeText(args.profile.name) || 'Candidate'} Resume`);
  pdf.setSubject('ATS-optimized resume');
  pdf.setCreator('CV Assistant');
  pdf.setProducer('CV Assistant');
  const fonts = await embedResumeFonts(pdf, textCorpus);
  const accent = accentColor(args.request.stylePreferences?.accentColor);
  const ctx = createDrawContext({ pdf, fonts, preset, template: args.template, accent });

  if (args.template === 'style3' || args.template === 'style5') {
    drawSidebarLayout({ template: args.template, ctx, fonts, preset, profile: args.profile, items: args.items, skillsText, profileText, accent });
  } else if (args.template === 'style4') {
    drawModernTwoColumnLayout({ ctx, fonts, preset, profile: args.profile, items: args.items, skillsText, profileText, accent });
  } else {
    drawClassicLayout({ template: args.template, ctx, fonts, preset, profile: args.profile, items: args.items, skillsText, profileText, accent });
  }

  const pageCount = pdf.getPageCount();
  const usableHeight = PAGE_HEIGHT - preset.marginY * 2;
  const lastPageFillRatio = pageCount > 1
    ? Math.max(0, Math.min(1, (ctx.top - ctx.y) / usableHeight))
    : Math.max(0, Math.min(1, (ctx.top - ctx.y) / usableHeight));
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes, pageCount, lastPageFillRatio, density: preset, selectedItems: args.items, usingTimes: fonts.usingTimes };
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

export async function renderResumePdf(args: {
  template: ResumeTemplateId;
  profile: ResumePdfProfile;
  request: ResumeRenderRequest;
}): Promise<ResumePdfResult> {
  const enhanced = await maybeEnhanceContent({ profile: args.profile, request: args.request });
  let items = collectItems({
    profile: args.profile,
    request: args.request,
    enhancedProjects: enhanced.enhancedProjects,
    enhancedExperiences: enhanced.enhancedExperiences,
  });
  items.sort((a, b) => b.weight - a.weight);

  const backfill = args.request.autoFit ? collectBackfillItems(args.profile, items) : [];
  let best: RenderAttempt | null = null;

  for (let cycle = 0; cycle < 40; cycle += 1) {
    for (const density of DENSITIES) {
      const attempt = await renderAttempt({
        template: args.template,
        profile: args.profile,
        request: args.request,
        items,
        density,
        enhancedSkills: enhanced.enhancedSkills,
      });
      best = !best || attempt.pageCount < best.pageCount || attempt.bytes.length < best.bytes.length ? attempt : best;

      if (attempt.pageCount <= MAX_PAGES) {
        const canBackfill = args.request.autoFit && attempt.lastPageFillRatio < TARGET_MIN_LAST_PAGE_FILL && backfill.length > 0;
        if (canBackfill) {
          const candidate = backfill.shift();
          if (candidate) {
            const expanded = [...items, candidate].sort((a, b) => b.weight - a.weight);
            const expandedAttempt = await renderAttempt({
              template: args.template,
              profile: args.profile,
              request: args.request,
              items: expanded,
              density,
              enhancedSkills: enhanced.enhancedSkills,
            });
            if (expandedAttempt.pageCount <= MAX_PAGES) {
              items = expanded;
              best = expandedAttempt;
              continue;
            }
          }
        }

        const atsText = [args.profile.name, args.profile.major, args.profile.school, args.profile.profileSummary, args.profile.skills, ...items.flatMap((item) => [item.title, item.body])].join(' ');
        return {
          bytes: attempt.bytes,
          telemetry: {
            pageCount: attempt.pageCount,
            density: attempt.density.key,
            atsScore: scoreAts(atsText, args.request.jobDescription, attempt.pageCount),
            selectedExperiences: items.filter((item) => item.type === 'experience').length,
            selectedProjects: items.filter((item) => item.type === 'project').length,
            finalItemCount: items.length,
            lastPageFillRatio: attempt.lastPageFillRatio,
            usingTimes: attempt.usingTimes,
            truncatedToTwoPages: false,
          },
        };
      }
    }

    if (items.length <= 1) break;
    items = dropWeakestItem(items);
  }

  const fallback = best || await renderAttempt({
    template: args.template,
    profile: args.profile,
    request: args.request,
    items,
    density: DENSITIES[DENSITIES.length - 1],
    enhancedSkills: enhanced.enhancedSkills,
  });
  const finalBytes = fallback.pageCount > MAX_PAGES ? await truncateToTwoPages(fallback.bytes) : fallback.bytes;
  const finalPageCount = fallback.pageCount > MAX_PAGES ? MAX_PAGES : fallback.pageCount;
  const atsText = [args.profile.name, args.profile.major, args.profile.school, args.profile.profileSummary, args.profile.skills, ...items.flatMap((item) => [item.title, item.body])].join(' ');

  return {
    bytes: finalBytes,
    telemetry: {
      pageCount: finalPageCount,
      density: fallback.density.key,
      atsScore: scoreAts(atsText, args.request.jobDescription, finalPageCount),
      selectedExperiences: items.filter((item) => item.type === 'experience').length,
      selectedProjects: items.filter((item) => item.type === 'project').length,
      finalItemCount: items.length,
      lastPageFillRatio: fallback.lastPageFillRatio,
      usingTimes: fallback.usingTimes,
      truncatedToTwoPages: fallback.pageCount > MAX_PAGES,
    },
  };
}
