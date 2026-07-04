import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { buildJustifiedTextLines, wrapTextLines } from '@/app/api/resume/pdf-layout';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { getCoverLetterContactDetails } from '@/lib/cover-letter';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MAX_PDF_BYTES = 512 * 1024;

const INK = rgb(0.085, 0.105, 0.135);
const MUTED = rgb(0.34, 0.38, 0.44);
const ACCENT = rgb(0.055, 0.145, 0.285);
const ACCENT_SOFT = rgb(0.86, 0.905, 0.955);
const PANEL = rgb(0.972, 0.978, 0.986);
const BORDER = rgb(0.80, 0.845, 0.90);
const WHITE = rgb(1, 1, 1);

type RenderPreset = {
  name: 'premium' | 'compact' | 'micro';
  marginX: number;
  topMargin: number;
  bottomMargin: number;
  bodySize: number;
  bodyLineHeight: number;
  headerNameSize: number;
  headerInfoSize: number;
  metaSize: number;
  paragraphGap: number;
  furniture: boolean;
  justify: boolean;
  preferStandardFonts: boolean;
};

const RENDER_PRESETS: RenderPreset[] = [
  {
    name: 'premium',
    marginX: 62,
    topMargin: 56,
    bottomMargin: 58,
    bodySize: 10.9,
    bodyLineHeight: 16.4,
    headerNameSize: 21,
    headerInfoSize: 8.4,
    metaSize: 9.5,
    paragraphGap: 9,
    furniture: true,
    justify: true,
    preferStandardFonts: false,
  },
  {
    name: 'compact',
    marginX: 56,
    topMargin: 50,
    bottomMargin: 50,
    bodySize: 10.15,
    bodyLineHeight: 14.8,
    headerNameSize: 18.5,
    headerInfoSize: 7.8,
    metaSize: 8.8,
    paragraphGap: 6.5,
    furniture: true,
    justify: false,
    preferStandardFonts: true,
  },
  {
    name: 'micro',
    marginX: 50,
    topMargin: 46,
    bottomMargin: 46,
    bodySize: 9.65,
    bodyLineHeight: 13.9,
    headerNameSize: 17.25,
    headerInfoSize: 7.3,
    metaSize: 8.3,
    paragraphGap: 5.5,
    furniture: false,
    justify: false,
    preferStandardFonts: true,
  },
];

function normalizeLine(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function looksLikeDateLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.test(trimmed) || /\b[A-Za-z]+\s+\d{1,2},\s+\d{4}\b/.test(trimmed);
}

function looksLikeRecipientLine(value: string, company: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (company && normalizeLine(trimmed) === normalizeLine(company)) return true;
  return /^(hiring manager|hiring team|dear hiring manager|dear recruiter|recruitment team)$/i.test(trimmed);
}

function splitClosingLine(value: string) {
  const match = value
    .trim()
    .match(/^(kind regards|best regards|warm regards|regards|sincerely|yours sincerely|yours faithfully),?\s*(.*)$/i);
  if (!match) return null;

  const closing = `${match[1]},`;
  const signature = match[2]?.trim();
  return signature ? [closing, signature] : [closing];
}

function normalizeLetterBlocks(blocks: string[][]) {
  const normalizedBlocks: string[] = [];

  for (const block of blocks) {
    let currentParagraph: string[] = [];
    let closingLines: string[] = [];

    for (const line of block) {
      const closingLine = splitClosingLine(line);
      if (closingLine) {
        if (currentParagraph.length) {
          normalizedBlocks.push(currentParagraph.join(' ').trim());
          currentParagraph = [];
        }
        closingLines = closingLine;
        continue;
      }

      if (closingLines.length) {
        closingLines.push(line);
      } else {
        currentParagraph.push(line);
      }
    }

    if (currentParagraph.length) {
      normalizedBlocks.push(currentParagraph.join(' ').trim());
    }
    if (closingLines.length) {
      normalizedBlocks.push(closingLines.join('\n').trim());
    }
  }

  return normalizedBlocks.filter(Boolean);
}

function extractLetterParagraphs(args: {
  coverLetter: string;
  company: string;
  profile: ReturnType<typeof getCoverLetterContactDetails>;
}) {
  const rawBlocks = args.coverLetter
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0);

  if (!rawBlocks.length) return [];

  const normalizedName = normalizeLine(args.profile.name);
  const contactTokens = [args.profile.phone, args.profile.email, args.profile.website, args.profile.linkedin]
    .map((value) => normalizeLine(value || ''))
    .filter(Boolean);

  const firstBlock = rawBlocks[0];
  const firstBlockLooksLikeHeader = firstBlock.some((line) => {
    const normalized = normalizeLine(line);
    return (
      (!!normalizedName && normalized === normalizedName) ||
      contactTokens.some((token) => token && normalized.includes(token)) ||
      line.includes('@') ||
      /linkedin|phone|email|http|www\./i.test(line)
    );
  });

  let startIndex = firstBlockLooksLikeHeader ? 1 : 0;
  const nextBlock = rawBlocks[startIndex];
  if (
    nextBlock &&
    nextBlock.length <= 4 &&
    nextBlock.every((line) => line.length <= 82) &&
    nextBlock.some((line) => looksLikeDateLine(line) || looksLikeRecipientLine(line, args.company))
  ) {
    startIndex += 1;
  }

  return normalizeLetterBlocks(rawBlocks.slice(startIndex));
}

function toFilenameFragment(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'cover-letter';
}

function isStandardFontSafe(value: string) {
  return [...value].every((char) => char.charCodeAt(0) <= 255);
}

function drawRightAlignedText(args: {
  page: PDFPage;
  text: string;
  xRight: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
}) {
  const width = args.font.widthOfTextAtSize(args.text, args.size);
  args.page.drawText(args.text, {
    x: args.xRight - width,
    y: args.y,
    size: args.size,
    font: args.font,
    color: args.color || INK,
  });
}

function drawCharacterSpacedText(args: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
  tracking: number;
}) {
  let cursor = args.x;
  for (const char of args.text) {
    args.page.drawText(char, { x: cursor, y: args.y, size: args.size, font: args.font, color: args.color });
    cursor += args.font.widthOfTextAtSize(char, args.size) + args.tracking;
  }
}

function fallbackParagraphs(coverLetter: string) {
  return coverLetter
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function createFonts(pdf: PDFDocument, textCorpus: string, preset: RenderPreset) {
  const canUseStandard = preset.preferStandardFonts && isStandardFontSafe(textCorpus);
  if (canUseStandard) {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
  }

  return embedNotoSansFonts(pdf, { subset: true });
}

async function renderCoverLetterPdf(args: {
  coverLetter: string;
  company: string;
  contactDetails: ReturnType<typeof getCoverLetterContactDetails>;
  paragraphs: string[];
  formattedDate: string;
  preset: RenderPreset;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${args.company || 'Candidate'} Cover Letter`);
  pdf.setAuthor(args.contactDetails.name || 'CV Assistant');
  pdf.setSubject('Cover Letter');
  pdf.setCreator('CV Assistant');
  pdf.setProducer('CV Assistant');

  const textCorpus = [args.coverLetter, args.company, args.contactDetails.name, ...args.contactDetails.letterheadLines].join('\n');
  const fonts = await createFonts(pdf, textCorpus, args.preset);
  const regularFont = fonts.regular;
  const boldFont = fonts.bold;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  const left = args.preset.marginX;
  const right = PAGE_WIDTH - args.preset.marginX;
  const contentWidth = right - left;
  let y = PAGE_HEIGHT - args.preset.topMargin;

  function drawPageFurniture() {
    if (args.preset.furniture) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 15, width: PAGE_WIDTH, height: 15, color: ACCENT });
      page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 6, color: ACCENT_SOFT });
      page.drawRectangle({ x: 38, y: args.preset.bottomMargin - 3, width: 2, height: PAGE_HEIGHT - args.preset.topMargin - args.preset.bottomMargin + 4, color: ACCENT_SOFT });
    }

    page.drawLine({
      start: { x: left, y: args.preset.bottomMargin - 18 },
      end: { x: right, y: args.preset.bottomMargin - 18 },
      thickness: 0.45,
      color: BORDER,
    });

    drawRightAlignedText({
      page,
      text: `Page ${pageNumber}`,
      xRight: right,
      y: args.preset.bottomMargin - 33,
      size: 7.2,
      font: regularFont,
      color: MUTED,
    });
  }

  function addPage() {
    pageNumber += 1;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageFurniture();
    y = PAGE_HEIGHT - args.preset.topMargin - 14;
  }

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight < args.preset.bottomMargin) {
      addPage();
    }
  }

  function drawLabelValue(label: string, valueLines: string[], x: number, width: number) {
    drawCharacterSpacedText({
      page,
      text: label.toUpperCase(),
      x,
      y,
      size: 7,
      font: boldFont,
      color: ACCENT,
      tracking: 0.8,
    });
    y -= 12;

    for (const line of valueLines.flatMap((value) => wrapTextLines(value, regularFont, args.preset.metaSize, width))) {
      page.drawText(line, {
        x,
        y,
        size: args.preset.metaSize,
        font: regularFont,
        color: INK,
      });
      y -= args.preset.metaSize + 3.2;
    }
  }

  function drawParagraph(paragraph: string) {
    const paragraphLines = paragraph.includes('\n')
      ? paragraph.split('\n').flatMap((line) => wrapTextLines(line, regularFont, args.preset.bodySize, contentWidth))
      : buildJustifiedTextLines(paragraph, regularFont, args.preset.bodySize, contentWidth).map((line) => line.text);

    ensureSpace(paragraphLines.length * args.preset.bodyLineHeight + args.preset.paragraphGap + 2);

    if (paragraph.includes('\n')) {
      for (const line of paragraphLines) {
        page.drawText(line, { x: left, y, size: args.preset.bodySize, font: regularFont, color: INK });
        y -= args.preset.bodyLineHeight;
      }
      y -= args.preset.paragraphGap;
      return;
    }

    const justifiedLines = buildJustifiedTextLines(paragraph, regularFont, args.preset.bodySize, contentWidth);
    for (const line of justifiedLines) {
      if (args.preset.justify && line.justify && line.words.length > 1) {
        const wordsWidth = line.words.reduce((total, word) => total + regularFont.widthOfTextAtSize(word, args.preset.bodySize), 0);
        const gap = Math.max(3, (contentWidth - wordsWidth) / (line.words.length - 1));
        let x = left;
        for (const word of line.words) {
          page.drawText(word, { x, y, size: args.preset.bodySize, font: regularFont, color: INK });
          x += regularFont.widthOfTextAtSize(word, args.preset.bodySize) + gap;
        }
      } else {
        page.drawText(line.text, { x: left, y, size: args.preset.bodySize, font: regularFont, color: INK });
      }
      y -= args.preset.bodyLineHeight;
    }

    y -= args.preset.paragraphGap;
  }

  drawPageFurniture();

  const headerName = args.contactDetails.name || 'Candidate';
  const headerNameLines = wrapTextLines(headerName, boldFont, args.preset.headerNameSize, Math.floor(contentWidth * 0.64));
  for (const line of headerNameLines) {
    page.drawText(line, { x: left, y, size: args.preset.headerNameSize, font: boldFont, color: INK });
    y -= args.preset.headerNameSize + 0.8;
  }

  drawRightAlignedText({
    page,
    text: 'COVER LETTER',
    xRight: right,
    y: PAGE_HEIGHT - args.preset.topMargin + 1,
    size: 8.3,
    font: boldFont,
    color: ACCENT,
  });

  const contactLines = args.contactDetails.letterheadLines.flatMap((line) =>
    wrapTextLines(line, regularFont, args.preset.headerInfoSize, contentWidth),
  );
  if (contactLines.length) {
    y -= 4;
    for (const line of contactLines) {
      page.drawText(line, { x: left, y, size: args.preset.headerInfoSize, font: regularFont, color: MUTED });
      y -= args.preset.headerInfoSize + 2;
    }
  }

  y -= args.preset.name === 'micro' ? 10 : 14;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.1, color: ACCENT });
  y -= args.preset.name === 'micro' ? 16 : 22;

  const panelHeight = args.preset.name === 'micro' ? 48 : args.preset.name === 'compact' ? 54 : 64;
  ensureSpace(panelHeight + 16);
  page.drawRectangle({
    x: left,
    y: y - panelHeight + 9,
    width: contentWidth,
    height: panelHeight,
    color: args.preset.furniture ? PANEL : WHITE,
    borderColor: BORDER,
    borderWidth: 0.5,
  });

  const panelTop = y - 8;
  const columnWidth = (contentWidth - 32) / 2;
  y = panelTop;
  drawLabelValue('Date', [args.formattedDate], left + 15, columnWidth);
  y = panelTop;
  drawLabelValue('To', ['Hiring Team', args.company || 'Target Company'].filter(Boolean), left + 24 + columnWidth, columnWidth);
  y = panelTop - panelHeight + 1;

  const bodyParagraphs = args.paragraphs.length ? args.paragraphs : fallbackParagraphs(args.coverLetter);
  for (const paragraph of bodyParagraphs) {
    drawParagraph(paragraph);
  }

  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

async function renderWithCompressionFallback(args: {
  coverLetter: string;
  company: string;
  contactDetails: ReturnType<typeof getCoverLetterContactDetails>;
  paragraphs: string[];
  formattedDate: string;
}) {
  const renders = [] as { bytes: Uint8Array; preset: RenderPreset }[];

  for (const preset of RENDER_PRESETS) {
    const bytes = await renderCoverLetterPdf({ ...args, preset });
    renders.push({ bytes, preset });
    if (bytes.length <= MAX_PDF_BYTES) {
      return { bytes, compressed: preset.name !== 'premium', presetName: preset.name, withinLimit: true };
    }
  }

  const smallest = renders.reduce((best, current) => (current.bytes.length < best.bytes.length ? current : best));
  return {
    bytes: smallest.bytes,
    compressed: true,
    presetName: smallest.preset.name,
    withinLimit: smallest.bytes.length <= MAX_PDF_BYTES,
  };
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const coverLetter = typeof body?.coverLetter === 'string' ? body.coverLetter.trim() : '';
  const company = typeof body?.company === 'string' ? body.company.trim() : '';

  if (!coverLetter) {
    return NextResponse.json({ error: 'Missing coverLetter' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile as DbProfile | undefined;
  const contactDetails = getCoverLetterContactDetails(profile);
  const paragraphs = extractLetterParagraphs({ coverLetter, company, profile: contactDetails });
  const formattedDate = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  }).format(new Date());

  const { bytes, compressed, presetName, withinLimit } = await renderWithCompressionFallback({
    coverLetter,
    company,
    contactDetails,
    paragraphs,
    formattedDate,
  });

  const filename = `${company ? `${toFilenameFragment(company)}-` : ''}cover-letter.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-CV-Assistant-PDF-Size': String(bytes.length),
      'X-CV-Assistant-Compressed': compressed ? 'true' : 'false',
      'X-CV-Assistant-PDF-Preset': presetName,
      'X-CV-Assistant-Within-512KB': withinLimit ? 'true' : 'false',
    },
  });
}
