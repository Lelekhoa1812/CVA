import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, type PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { buildJustifiedTextLines, wrapTextLines } from '@/app/api/resume/pdf-layout';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { getCoverLetterContactDetails } from '@/lib/cover-letter';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN_X = 62;
const PAGE_TOP_MARGIN = 58;
const PAGE_BOTTOM_MARGIN = 58;
const MAX_PDF_BYTES = 512 * 1024;

const BODY_FONT_SIZE = 10.9;
const BODY_LINE_HEIGHT = 16.4;
const COMPACT_BODY_FONT_SIZE = 10.25;
const COMPACT_BODY_LINE_HEIGHT = 14.9;
const HEADER_NAME_SIZE = 21;
const HEADER_INFO_SIZE = 8.4;
const DATE_FONT_SIZE = 9.6;
const RECIPIENT_FONT_SIZE = 10.2;
const SECTION_SPACING = 13;

const INK = rgb(0.1, 0.14, 0.2);
const MUTED = rgb(0.35, 0.4, 0.47);
const ACCENT = rgb(0.08, 0.2, 0.38);
const ACCENT_LIGHT = rgb(0.83, 0.89, 0.95);
const PANEL = rgb(0.965, 0.975, 0.985);
const BORDER = rgb(0.84, 0.88, 0.92);

function normalizeLine(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function looksLikeDateLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.test(trimmed) ||
    /\b[A-Za-z]+\s+\d{1,2},\s+\d{4}\b/.test(trimmed)
  );
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
  const contactTokens = [
    args.profile.phone,
    args.profile.email,
    args.profile.website,
    args.profile.linkedin,
  ]
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

  const secondBlock = rawBlocks[startIndex];
  if (
    secondBlock &&
    secondBlock.length <= 4 &&
    secondBlock.every((line) => line.length <= 80) &&
    secondBlock.some((line) => looksLikeDateLine(line) || looksLikeRecipientLine(line, args.company))
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
  page: ReturnType<PDFDocument['addPage']>;
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

async function renderCoverLetterPdf(args: {
  coverLetter: string;
  company: string;
  contactDetails: ReturnType<typeof getCoverLetterContactDetails>;
  paragraphs: string[];
  formattedDate: string;
  compact: boolean;
}) {
  const pdf = await PDFDocument.create();
  const textCorpus = [
    args.coverLetter,
    args.company,
    args.contactDetails.name,
    ...args.contactDetails.letterheadLines,
  ].join('\n');
  const useStandardFonts = args.compact && isStandardFontSafe(textCorpus);
  const fonts = useStandardFonts
    ? {
        regular: await pdf.embedFont(StandardFonts.Helvetica),
        bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      }
    : await embedNotoSansFonts(pdf, { subset: true });
  const regularFont = fonts.regular;
  const boldFont = fonts.bold;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  const left = PAGE_MARGIN_X;
  const right = PAGE_WIDTH - PAGE_MARGIN_X;
  const contentWidth = right - left;
  const bodyFontSize = args.compact ? COMPACT_BODY_FONT_SIZE : BODY_FONT_SIZE;
  const bodyLineHeight = args.compact ? COMPACT_BODY_LINE_HEIGHT : BODY_LINE_HEIGHT;
  const paragraphGap = args.compact ? 6 : 9;
  let y = PAGE_HEIGHT - PAGE_TOP_MARGIN;

  function drawPageFurniture() {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 14, width: PAGE_WIDTH, height: 14, color: ACCENT });
    page.drawRectangle({ x: 38, y: PAGE_BOTTOM_MARGIN - 4, width: 2.2, height: PAGE_HEIGHT - 108, color: ACCENT_LIGHT });
    page.drawLine({
      start: { x: left, y: PAGE_BOTTOM_MARGIN - 16 },
      end: { x: right, y: PAGE_BOTTOM_MARGIN - 16 },
      thickness: 0.45,
      color: BORDER,
    });
    drawRightAlignedText({
      page,
      text: `Page ${pageNumber}`,
      xRight: right,
      y: PAGE_BOTTOM_MARGIN - 32,
      size: 7.6,
      font: regularFont,
      color: MUTED,
    });
  }

  function addPage() {
    pageNumber += 1;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageFurniture();
    y = PAGE_HEIGHT - PAGE_TOP_MARGIN - 18;
  }

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight < PAGE_BOTTOM_MARGIN) {
      addPage();
    }
  }

  function drawLabelValue(label: string, valueLines: string[], x: number, width: number) {
    page.drawText(label.toUpperCase(), {
      x,
      y,
      size: 7.2,
      font: boldFont,
      color: ACCENT,
    });
    y -= 12;

    for (const line of valueLines.flatMap((value) => wrapTextLines(value, regularFont, DATE_FONT_SIZE, width))) {
      page.drawText(line, {
        x,
        y,
        size: DATE_FONT_SIZE,
        font: regularFont,
        color: INK,
      });
      y -= DATE_FONT_SIZE + 3.5;
    }
  }

  function drawJustifiedParagraph(paragraph: string) {
    const lines = buildJustifiedTextLines(paragraph, regularFont, bodyFontSize, contentWidth);
    ensureSpace(lines.length * bodyLineHeight + paragraphGap + 2);

    for (const line of lines) {
      if (!args.compact && line.justify && line.words.length > 1) {
        const wordsWidth = line.words.reduce((total, word) => total + regularFont.widthOfTextAtSize(word, bodyFontSize), 0);
        const gap = Math.max(3, (contentWidth - wordsWidth) / (line.words.length - 1));
        let x = left;
        for (const word of line.words) {
          page.drawText(word, { x, y, size: bodyFontSize, font: regularFont, color: INK });
          x += regularFont.widthOfTextAtSize(word, bodyFontSize) + gap;
        }
      } else {
        page.drawText(line.text, { x: left, y, size: bodyFontSize, font: regularFont, color: INK });
      }
      y -= bodyLineHeight;
    }

    y -= paragraphGap;
  }

  drawPageFurniture();

  const headerName = args.contactDetails.name || 'Candidate';
  const headerLines = wrapTextLines(headerName, boldFont, HEADER_NAME_SIZE, Math.floor(contentWidth * 0.64));
  for (const line of headerLines) {
    page.drawText(line, { x: left, y, size: HEADER_NAME_SIZE, font: boldFont, color: INK });
    y -= HEADER_NAME_SIZE + 1;
  }

  drawRightAlignedText({
    page,
    text: 'COVER LETTER',
    xRight: right,
    y: PAGE_HEIGHT - PAGE_TOP_MARGIN - 1,
    size: 8.4,
    font: boldFont,
    color: ACCENT,
  });

  const contactLines = args.contactDetails.letterheadLines.flatMap((line) =>
    wrapTextLines(line, regularFont, HEADER_INFO_SIZE, contentWidth),
  );
  if (contactLines.length) {
    y -= 5;
    for (const line of contactLines) {
      page.drawText(line, { x: left, y, size: HEADER_INFO_SIZE, font: regularFont, color: MUTED });
      y -= HEADER_INFO_SIZE + 2.2;
    }
  }

  y -= SECTION_SPACING;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.2,
    color: ACCENT,
  });
  y -= 22;

  const panelHeight = args.compact ? 58 : 64;
  ensureSpace(panelHeight + 18);
  page.drawRectangle({
    x: left,
    y: y - panelHeight + 10,
    width: contentWidth,
    height: panelHeight,
    color: PANEL,
    borderColor: BORDER,
    borderWidth: 0.55,
  });

  const panelTop = y - 8;
  const columnWidth = (contentWidth - 32) / 2;
  y = panelTop;
  drawLabelValue('Date', [args.formattedDate], left + 16, columnWidth);
  y = panelTop;
  drawLabelValue('To', ['Hiring Team', args.company || 'Target Company'].filter(Boolean), left + 24 + columnWidth, columnWidth);
  y = panelTop - panelHeight + 2;

  const bodyParagraphs = args.paragraphs.length
    ? args.paragraphs
    : args.coverLetter
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

  for (const paragraph of bodyParagraphs) {
    drawJustifiedParagraph(paragraph);
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return bytes;
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

  let compressed = false;
  let bytes = await renderCoverLetterPdf({
    coverLetter,
    company,
    contactDetails,
    paragraphs,
    formattedDate,
    compact: false,
  });

  if (bytes.length > MAX_PDF_BYTES) {
    compressed = true;
    bytes = await renderCoverLetterPdf({
      coverLetter,
      company,
      contactDetails,
      paragraphs,
      formattedDate,
      compact: true,
    });
  }

  const filename = `${company ? `${toFilenameFragment(company)}-` : ''}cover-letter.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-CV-Assistant-PDF-Size': String(bytes.length),
      'X-CV-Assistant-Compressed': compressed ? 'true' : 'false',
    },
  });
}
