import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel, type Profile as DbProfile } from '@/lib/models/User';
import { wrapTextLines } from '@/app/api/resume/pdf-layout';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { getCoverLetterContactDetails } from '@/lib/cover-letter';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 72;
const BODY_FONT_SIZE = 11;
const BODY_LINE_HEIGHT = 16.5;
const HEADER_NAME_SIZE = 20;
const HEADER_INFO_SIZE = 8.5;
const DATE_FONT_SIZE = 10.5;
const RECIPIENT_FONT_SIZE = 11;
const SECTION_SPACING = 14;

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

// Motivation vs Logic:
// Motivation: The generated cover letter can already include a plain-text header, but the PDF export now owns a
// formal "Modern Executive" presentation and should not duplicate contact/date blocks when styling the document.
// Logic: Strip only clearly header-like opening blocks with conservative heuristics, then render the remaining
// body inside the PDF template so the visual layout stays polished without rewriting the letter itself.
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

  return rawBlocks
    .slice(startIndex)
    .map((block) => block.join(' ').trim())
    .filter(Boolean);
}

function toFilenameFragment(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'cover-letter';
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

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { regular: regularFont, bold: boldFont } = await embedNotoSansFonts(pdf);

  const left = PAGE_MARGIN;
  const right = PAGE_WIDTH - PAGE_MARGIN;
  const bottom = PAGE_MARGIN;
  const contentWidth = right - left;
  const centerX = PAGE_WIDTH / 2;
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  function addPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  }

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight < bottom) {
      addPage();
    }
  }

  function drawLines(
    lines: string[],
    options: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number },
  ) {
    if (!lines.length) return;
    const gap = options.gap ?? 5;
    const font = options.bold ? boldFont : regularFont;
    const color = options.color || rgb(0.15, 0.19, 0.24);

    ensureSpace(lines.length * (options.size + gap));

    for (const line of lines) {
      page.drawText(line, {
        x: left,
        y,
        size: options.size,
        font,
        color,
      });
      y -= options.size + gap;
    }
  }

  function drawCenteredLines(
    lines: string[],
    options: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number },
  ) {
    if (!lines.length) return;
    const gap = options.gap ?? 4;
    const font = options.bold ? boldFont : regularFont;
    const color = options.color || rgb(0.15, 0.19, 0.24);

    ensureSpace(lines.length * (options.size + gap));

    for (const line of lines) {
      const textWidth = font.widthOfTextAtSize(line, options.size);
      const x = Math.max(left, centerX - textWidth / 2);
      page.drawText(line, {
        x,
        y,
        size: options.size,
        font,
        color,
      });
      y -= options.size + gap;
    }
  }

  const headerName = contactDetails.name || 'Candidate';
  drawCenteredLines(wrapTextLines(headerName, boldFont, HEADER_NAME_SIZE, contentWidth), {
    size: HEADER_NAME_SIZE,
    bold: true,
    color: rgb(0.08, 0.12, 0.18),
    gap: 2,
  });

  if (contactDetails.letterheadLines.length) {
    drawCenteredLines(
      contactDetails.letterheadLines.flatMap((line) => wrapTextLines(line, regularFont, HEADER_INFO_SIZE, contentWidth)),
      {
        size: HEADER_INFO_SIZE,
        color: rgb(0.34, 0.39, 0.45),
        gap: 2,
      },
    );
  }

  ensureSpace(18);
  page.drawLine({
    start: { x: left, y: y + 4 },
    end: { x: right, y: y + 4 },
    thickness: 1,
    color: rgb(0.84, 0.87, 0.9),
  });
  y -= SECTION_SPACING + 4;

  drawLines([formattedDate], {
    size: DATE_FONT_SIZE,
    color: rgb(0.28, 0.33, 0.39),
    gap: 2,
  });

  const businessHeader = [company ? 'Hiring Team' : '', company].filter(Boolean);
  drawLines(
    businessHeader.flatMap((line) => wrapTextLines(line, regularFont, RECIPIENT_FONT_SIZE, contentWidth)),
    {
      size: RECIPIENT_FONT_SIZE,
      bold: Boolean(company),
      color: rgb(0.15, 0.19, 0.24),
      gap: 3,
    },
  );
  y -= 8;

  const bodyParagraphs = paragraphs.length
    ? paragraphs
    : coverLetter
        .split(/\n+/)
        .map((line: string) => line.trim())
        .filter(Boolean);

  for (const paragraph of bodyParagraphs) {
    const lines = wrapTextLines(paragraph, regularFont, BODY_FONT_SIZE, contentWidth);
    ensureSpace(lines.length * BODY_LINE_HEIGHT + 10);

    for (const line of lines) {
      page.drawText(line, {
        x: left,
        y,
        size: BODY_FONT_SIZE,
        font: regularFont,
        color: rgb(0.15, 0.19, 0.24),
      });
      y -= BODY_LINE_HEIGHT;
    }

    y -= 10;
  }

  const bytes = await pdf.save();
  const filename = `${company ? `${toFilenameFragment(company)}-` : ''}cover-letter.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
