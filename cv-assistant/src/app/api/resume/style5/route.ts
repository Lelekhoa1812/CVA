// app/api/resume/style5/route.ts
// Premium "Ledger" resume:
// - Strong nameplate with a full-width capabilities band
// - Main editorial ledger column for experience and projects
// - Narrow profile rail for education, links, and languages
// - Stable measured wrapping for long skills and dense bullet content

import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/ai';
import { MAX_RESUME_ITEMS } from '@/lib/resume/constants';
import { formatResumeSkillsParagraph, resolveResumeSkillsText } from '@/lib/resume/skills';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildJustifiedTextLines, packItemsIntoLines, splitResumeItems, stripMarkdownForPdf, wrapTextLines } from '@/app/api/resume/pdf-layout';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    skills,
    selectedProjects,
    selectedExperiences,
    enhance,
    qa,
    stylePreferences,
    contentEnhancementData
  } = await req.json();

  console.log('PDF generation request (style5):', {
    skills: skills?.substring(0, 100) + '...',
    selectedProjects: selectedProjects?.length,
    selectedExperiences: selectedExperiences?.length,
    enhance,
    hasQa: !!qa,
    hasStylePreferences: !!stylePreferences
  });

  if (!Array.isArray(selectedProjects) || !Array.isArray(selectedExperiences)) {
    return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
  }
  if (selectedProjects.length + selectedExperiences.length > MAX_RESUME_ITEMS) {
    return NextResponse.json({ error: 'Too many items selected' }, { status: 400 });
  }
  if (selectedProjects.length === 0 && selectedExperiences.length === 0) {
    return NextResponse.json({ error: 'Please select at least one project or experience' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();

  type Project = { name?: string; summary?: string; description?: string };
  type Experience = { companyName?: string; role?: string; summary?: string; description?: string; timeFrom?: string; timeTo?: string };
  type Profile = {
    name?: string;
    major?: string;
    school?: string;
    email?: string;
    workEmail?: string;
    phone?: string;
    website?: string;
    linkedin?: string;
    skills?: string;
    languages?: string;
    studyPeriod?: string;
    projects?: Project[];
    experiences?: Experience[];
  };
  const profile = (user?.profile || {}) as Profile;

  let enhancedSkills: string | undefined;
  const enhancedProjectSummaries: Record<number, string> = {};
  const enhancedExperienceSummaries: Record<number, string> = {};

  let fontSize = 11;
  let contentDensity = 'balanced';
  const accentPref = (stylePreferences?.accentColor as string) || 'dark-blue';

  if (stylePreferences) {
    fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
    contentDensity = stylePreferences.contentDensity || 'balanced';
  }

  if (enhance && stylePreferences) {
    try {
      // Motivation vs Logic:
      // Motivation: Adding a fifth PDF style should preserve the same content-enhancement quality bar as the
      // existing routes instead of introducing a weaker bespoke path just for the new design.
      // Logic: Reuse the centralized `hard` model preset and the same summarize/enhance downstream APIs so the
      // new template stays visually distinct while the rewriting behavior remains consistent with the gallery.
      const model = getModel('hard');
      async function improve(prompt: string) {
        const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        return res.response.text().trim();
      }
      const qaNotes = Array.isArray(qa) && qa.length
        ? `\nContext from Q&A (user and assistant messages):\n${qa.map((m: { role: string; content: string }) => `[${m.role}] ${m.content}`).join('\n')}`
        : '';

      if (skills) {
        enhancedSkills = await improve(
          `Rewrite these skills as a concise comma-separated list, removing redundancy and keeping professional tone.${qaNotes}\nSkills:\n${skills}`
        );
      }

      if (Array.isArray(profile.projects) && selectedProjects.length > 0) {
        const chunkSize = Math.ceil(selectedProjects.length / 2);
        for (let i = 0; i < selectedProjects.length; i += chunkSize) {
          const chunk = selectedProjects.slice(i, i + chunkSize);
          for (const idx of chunk) {
            const p = profile.projects?.[idx];
            if (!p) continue;
            const base = p.summary || '';
            let improved = await improve(
              `Improve these resume bullet points for a project in crisp, high-impact bullets (2-3 bullets max). Keep content precise, factual, and ATS-friendly. Return only bullets separated by newlines.${qaNotes}\nProject name: ${p.name || ''}\nBullets/summary to improve:\n${base}`
            );

            if (contentDensity === 'concise') {
              const summaryRes = await fetch(`${req.nextUrl.origin}/api/resume/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'project' })
              });
              if (summaryRes.ok) improved = (await summaryRes.json()).summarizedContent;
            } else if (contentDensity === 'detailed') {
              const enhanceRes = await fetch(`${req.nextUrl.origin}/api/resume/enhance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'project', qaContext: qaNotes })
              });
              if (enhanceRes.ok) improved = (await enhanceRes.json()).enhancedContent;
            }

            enhancedProjectSummaries[idx] = improved;
          }
        }
      }

      if (Array.isArray(profile.experiences) && selectedExperiences.length > 0) {
        const chunkSize = Math.ceil(selectedExperiences.length / 2);
        for (let i = 0; i < selectedExperiences.length; i += chunkSize) {
          const chunk = selectedExperiences.slice(i, i + chunkSize);
          for (const idx of chunk) {
            const ex = profile.experiences?.[idx];
            if (!ex) continue;
            const base = ex.summary || '';
            let improved = await improve(
              `Improve these resume bullet points for a work experience in crisp, high-impact bullets (2-3 bullets max). Use quantified achievements when possible. Return only bullets separated by newlines.${qaNotes}\nCompany: ${ex.companyName || ''}\nRole: ${ex.role || ''}\nBullets/summary to improve:\n${base}`
            );

            if (contentDensity === 'concise') {
              const summaryRes = await fetch(`${req.nextUrl.origin}/api/resume/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'experience' })
              });
              if (summaryRes.ok) improved = (await summaryRes.json()).summarizedContent;
            } else if (contentDensity === 'detailed') {
              const enhanceRes = await fetch(`${req.nextUrl.origin}/api/resume/enhance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'experience', qaContext: qaNotes })
              });
              if (enhanceRes.ok) improved = (await enhanceRes.json()).enhancedContent;
            }

            enhancedExperienceSummaries[idx] = improved;
          }
        }
      }
    } catch (e) {
      console.warn('Enhancement skipped (style5):', e);
    }
  }

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  let { width, height } = page.getSize();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 42;
  const left = margin;
  const right = width - margin;
  const top = height - margin;
  const bottom = margin;
  const railWidth = 154;
  const gutter = 22;
  const mainLeft = left;
  const mainRight = right - railWidth - gutter;
  const railLeft = mainRight + gutter;
  const railRight = right;
  const railWidthInner = railRight - railLeft;

  type RGBVals = { r: number; g: number; b: number };
  function accentVals(key: string): RGBVals {
    switch (key) {
      case 'crimson': return { r: 165 / 255, g: 28 / 255, b: 48 / 255 };
      case 'dark-gray': return { r: 0.2, g: 0.2, b: 0.2 };
      case 'dark-green': return { r: 0.1, g: 0.4, b: 0.2 };
      case 'black': return { r: 0.07, g: 0.08, b: 0.1 };
      default: return { r: 0.11, g: 0.22, b: 0.52 };
    }
  }
  function mixVals(a: RGBVals, b: RGBVals, t: number): RGBVals {
    return {
      r: a.r * (1 - t) + b.r * t,
      g: a.g * (1 - t) + b.g * t,
      b: a.b * (1 - t) + b.b * t,
    };
  }

  const accentV = accentVals(accentPref);
  const accent = rgb(accentV.r, accentV.g, accentV.b);
  const accentSoftV = mixVals(accentV, { r: 1, g: 1, b: 1 }, 0.82);
  const accentDarkV = mixVals(accentV, { r: 0, g: 0, b: 0 }, 0.22);
  const accentSoft = rgb(accentSoftV.r, accentSoftV.g, accentSoftV.b);
  const accentDark = rgb(accentDarkV.r, accentDarkV.g, accentDarkV.b);
  const ink = rgb(0.11, 0.12, 0.15);
  const muted = rgb(0.39, 0.42, 0.47);
  const surface = rgb(0.985, 0.987, 0.992);
  const rule = rgb(0.84, 0.87, 0.91);

  const preferredEmail = profile.workEmail?.trim() ? profile.workEmail : profile.email;
  const contactItems = [preferredEmail, profile.phone, profile.website, profile.linkedin].filter(Boolean).map(String);

  let currentPage = 1;
  let yMain = top;
  let yRail = top;
  let contentStartY = top;

  function drawPageChrome(firstPage: boolean) {
    page.drawRectangle({ x: left, y: height - 18, width: right - left, height: 4, color: accent });
    page.drawLine({
      start: { x: railLeft - gutter / 2, y: top + 6 },
      end: { x: railLeft - gutter / 2, y: bottom },
      thickness: 0.8,
      color: rule
    });
    page.drawRectangle({
      x: railLeft,
      y: bottom,
      width: railWidthInner,
      height: top - bottom + 6,
      color: currentPage === 1 ? surface : rgb(0.992, 0.994, 0.998),
      borderColor: rule,
      borderWidth: 0.6
    });

    if (firstPage) {
      const nameText = profile.name || 'Your Name';
      const schoolLine = [profile.major, profile.school].filter(Boolean).join('  |  ') || 'Curated evidence, clean hierarchy, modern presentation';
      const nameSize = Math.max(fontSize + 15, 24);
      const labelSize = Math.max(fontSize - 2, 9);
      const schoolSize = Math.max(fontSize - 1, 10);

      page.drawText('RESUME LEDGER', { x: left, y: top, size: labelSize, font: helvBold, color: accent });
      page.drawText(nameText, { x: left, y: top - 26, size: nameSize, font: helvBold, color: accentDark });
      page.drawText(schoolLine, { x: left, y: top - 46, size: schoolSize, font: helv, color: muted });

      const contactText = contactItems.join('   •   ');
      const contactLines = contactText ? wrapTextLines(contactText, helv, labelSize, right - left) : [];
      let contactY = top - 64;
      for (const line of contactLines) {
        page.drawText(line, { x: left, y: contactY, size: labelSize, font: helv, color: ink });
        contactY -= labelSize + 4;
      }

      let skillsText = resolveResumeSkillsText(enhancedSkills, skills, profile.skills);
      if (!skillsText) skillsText = 'No skills specified';
      // Motivation vs Logic:
      // Motivation: The ledger header needed a quieter skills treatment that still aligns like polished body copy
      // instead of a full-size utility list.
      // Logic: Normalize the skills inventory into one paragraph, reduce the font size slightly, and justify the
      // wrapped lines inside the capabilities band so the section stays refined without changing the overall layout.
      const capabilitiesText = formatResumeSkillsParagraph(skillsText) || skillsText;
      const capabilitySize = Math.max(fontSize - 2, 9);
      const capabilityLines = buildJustifiedTextLines(capabilitiesText, helv, capabilitySize, right - left - 24);
      const capabilityLineHeight = capabilitySize + 5;
      const capabilitiesHeight = 16 + capabilityLines.length * capabilityLineHeight + 14;
      const bandTop = contactY - 10;
      const bandBottom = bandTop - capabilitiesHeight;

      page.drawRectangle({ x: left, y: bandBottom, width: right - left, height: capabilitiesHeight, color: accentSoft, borderColor: rule, borderWidth: 0.8 });
      page.drawText('CAPABILITIES', { x: left + 12, y: bandTop - 14, size: labelSize, font: helvBold, color: accentDark });
      let capabilityY = bandTop - 30;
      for (const line of capabilityLines) {
        drawJustifiedLineAt(line.words, line.text, left + 12, capabilityY, capabilitySize, right - left - 24, line.justify);
        capabilityY -= capabilityLineHeight;
      }

      contentStartY = bandBottom - 18;
      yMain = contentStartY;
      yRail = contentStartY;
      return;
    }

    const miniName = profile.name || 'Your Name';
    page.drawText(miniName, { x: left, y: top + 4, size: Math.max(fontSize - 1, 10), font: helvBold, color: accentDark });
    page.drawText('Ledger continued', {
      x: right - helv.widthOfTextAtSize('Ledger continued', Math.max(fontSize - 2, 9)),
      y: top + 4,
      size: Math.max(fontSize - 2, 9),
      font: helv,
      color: muted
    });
    contentStartY = top - 22;
    yMain = contentStartY;
    yRail = contentStartY;
  }

  drawPageChrome(true);

  function newPage() {
    page = pdf.addPage([612, 792]);
    ({ width, height } = page.getSize());
    currentPage += 1;
    drawPageChrome(false);
  }

  function ensureMainSpace(required: number) {
    if (yMain - required < bottom) newPage();
  }

  function drawRailPanel(title: string, lines: string[]) {
    if (!lines.length) return;
    const titleSize = Math.max(fontSize - 1, 9);
    const bodySize = Math.max(fontSize - 2, 8);
    const lineHeight = bodySize + 4;
    const wrappedLines = lines.flatMap((line) => wrapTextLines(line, helv, bodySize, railWidthInner - 20));
    const panelHeight = 18 + titleSize + wrappedLines.length * lineHeight + 18;
    const panelTop = yRail;
    const panelBottom = panelTop - panelHeight;

    page.drawRectangle({
      x: railLeft + 8,
      y: panelBottom,
      width: railWidthInner - 16,
      height: panelHeight,
      color: rgb(1, 1, 1),
      borderColor: rule,
      borderWidth: 0.8
    });
    page.drawRectangle({ x: railLeft + 8, y: panelTop - 4, width: railWidthInner - 16, height: 4, color: accent });
    page.drawText(title.toUpperCase(), { x: railLeft + 18, y: panelTop - 18, size: titleSize, font: helvBold, color: accentDark });

    let lineY = panelTop - 34;
    for (const line of wrappedLines) {
      page.drawText(line, { x: railLeft + 18, y: lineY, size: bodySize, font: helv, color: ink });
      lineY -= lineHeight;
    }

    yRail = panelBottom - 12;
  }

  const educationLines = [profile.school, profile.major, profile.studyPeriod].filter(Boolean).map(String);
  const linkLines = [preferredEmail, profile.phone, profile.website, profile.linkedin].filter(Boolean).map(String);
  const languageLines = profile.languages
    ? packItemsIntoLines(splitResumeItems(profile.languages), helv, Math.max(fontSize - 2, 8), railWidthInner - 20, ' • ')
    : [];

  drawRailPanel('Education', educationLines);
  drawRailPanel('Links', linkLines);
  if (languageLines.length) {
    drawRailPanel('Languages', languageLines);
  }

  const badgeWidth = 68;
  const badgeGap = 16;
  const bodyX = mainLeft + badgeWidth + badgeGap;
  const bodyWidth = mainRight - bodyX;

  function measureBadge(text: string) {
    const badgeSize = Math.max(fontSize - 3, 8);
    const badgeLines = wrapTextLines(text || 'DETAIL', helvBold, badgeSize, badgeWidth - 16);
    return {
      size: badgeSize,
      lines: badgeLines,
      height: 12 + badgeLines.length * (badgeSize + 2) + 10
    };
  }

  function getBodyMeasure(text: string, bulletMode: boolean) {
    const bodySize = Math.max(fontSize - 1, 10);
    const lineGap = 4;
    if (!text.trim()) {
      return { bodySize, height: 0, lines: [] as string[], bullets: [] as string[][] };
    }

    if (!bulletMode) {
      const lines = wrapTextLines(stripMarkdownForPdf(text), helv, bodySize, bodyWidth);
      return { bodySize, height: lines.length * (bodySize + lineGap), lines, bullets: [] as string[][] };
    }

    const bulletLines = stripMarkdownForPdf(text)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => wrapTextLines(line.replace(/^[•\-\u2013\u2014\*]\s*/, ''), helv, bodySize, bodyWidth - 12));
    const height = bulletLines.reduce((total, lines) => total + lines.length * (bodySize + lineGap) + 2, 0);
    return { bodySize, height, lines: [] as string[], bullets: bulletLines };
  }

  function drawJustifiedLineAt(
    words: string[],
    text: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
    justify: boolean
  ) {
    if (!justify || words.length <= 1) {
      page.drawText(text, { x, y, size, font: helv, color: ink });
      return;
    }

    const textWidth = helv.widthOfTextAtSize(text, size);
    if (textWidth >= maxWidth) {
      page.drawText(text, { x, y, size, font: helv, color: ink });
      return;
    }

    const spaceWidth = helv.widthOfTextAtSize(' ', size);
    const extra = (maxWidth - textWidth) / (words.length - 1);
    let cursor = x;

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      page.drawText(word, { x: cursor, y, size, font: helv, color: ink });
      if (i < words.length - 1) {
        cursor += helv.widthOfTextAtSize(word, size) + spaceWidth + extra;
      }
    }
  }

  function drawSection(title: string) {
    ensureMainSpace(32);
    const titleSize = Math.max(fontSize, 11);
    const markerWidth = helvBold.widthOfTextAtSize(`${String(currentPage).padStart(2, '0')}`, Math.max(fontSize - 2, 8));
    page.drawText(`${String(currentPage).padStart(2, '0')}`, {
      x: mainLeft,
      y: yMain,
      size: Math.max(fontSize - 2, 8),
      font: helvBold,
      color: muted
    });
    page.drawText(title.toUpperCase(), { x: mainLeft + markerWidth + 10, y: yMain, size: titleSize, font: helvBold, color: accentDark });
    yMain -= titleSize + 6;
    page.drawLine({ start: { x: mainLeft, y: yMain }, end: { x: mainRight, y: yMain }, thickness: 1, color: accent });
    yMain -= 12;
  }

  function drawLedgerEntry(badgeText: string, title: string, body: string, bulletMode: boolean, accentTitle = false) {
    const titleSize = Math.max(fontSize + 1, 12);
    const titleLines = wrapTextLines(title || 'Selected item', helvBold, titleSize, bodyWidth);
    const badge = measureBadge(badgeText);
    const measuredBody = getBodyMeasure(body, bulletMode);
    const textHeight = titleLines.length * (titleSize + 3) + (measuredBody.height ? 6 + measuredBody.height : 0);
    const entryHeight = Math.max(badge.height, textHeight) + 14;

    ensureMainSpace(entryHeight + 6);

    const topY = yMain;
    const badgeBottom = topY - badge.height;
    page.drawRectangle({
      x: mainLeft,
      y: badgeBottom,
      width: badgeWidth,
      height: badge.height,
      color: accentSoft,
      borderColor: rule,
      borderWidth: 0.8
    });

    let badgeY = topY - 14;
    for (const line of badge.lines) {
      const lineWidth = helvBold.widthOfTextAtSize(line, badge.size);
      page.drawText(line, {
        x: mainLeft + (badgeWidth - lineWidth) / 2,
        y: badgeY,
        size: badge.size,
        font: helvBold,
        color: accentDark
      });
      badgeY -= badge.size + 2;
    }

    page.drawLine({
      start: { x: bodyX - 8, y: topY },
      end: { x: bodyX - 8, y: topY - entryHeight + 10 },
      thickness: 1,
      color: rule
    });

    let textY = topY - 2;
    for (const line of titleLines) {
      page.drawText(line, {
        x: bodyX,
        y: textY,
        size: titleSize,
        font: helvBold,
        color: accentTitle ? accentDark : ink
      });
      textY -= titleSize + 3;
    }

    if (measuredBody.height) {
      textY -= 3;
      if (bulletMode) {
        const bulletSize = measuredBody.bodySize;
        for (const bulletLines of measuredBody.bullets) {
          if (!bulletLines.length) continue;
          page.drawText('•', { x: bodyX, y: textY, size: bulletSize, font: helvBold, color: accent });
          let bulletY = textY;
          for (const line of bulletLines) {
            page.drawText(line, { x: bodyX + 12, y: bulletY, size: bulletSize, font: helv, color: ink });
            bulletY -= bulletSize + 4;
          }
          textY = bulletY - 2;
        }
      } else {
        for (const line of measuredBody.lines) {
          page.drawText(line, { x: bodyX, y: textY, size: measuredBody.bodySize, font: helv, color: ink });
          textY -= measuredBody.bodySize + 4;
        }
      }
    }

    yMain = topY - entryHeight;
    page.drawLine({ start: { x: mainLeft, y: yMain + 4 }, end: { x: mainRight, y: yMain + 4 }, thickness: 0.6, color: rule });
    yMain -= 10;
  }

  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    drawSection('Experience');
    for (const idx of selectedExperiences) {
      const ex = profile.experiences?.[idx];
      if (!ex) continue;
      const title = `${ex.companyName || ''} — ${ex.role || ''}`.trim() || 'Experience';
      const timeInfo = `${ex.timeFrom || ''} ${ex.timeTo ? `to ${ex.timeTo}` : ''}`.trim() || 'Experience';
      const original = ex.description || ex.summary || '';
      const targeted = contentEnhancementData?.[`experience-${idx}`];
      const enhanced = enhancedExperienceSummaries[idx];
      const finalBody = (targeted || enhanced || original || '').trim();
      const bulletMode = finalBody.includes('\n') || /^[•\-\u2013\u2014\*]\s+/.test(finalBody);
      drawLedgerEntry(timeInfo, title, finalBody, bulletMode, true);
    }
  }

  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawSection('Projects');
    for (const idx of selectedProjects) {
      const project = profile.projects?.[idx];
      if (!project) continue;
      const original = project.description || project.summary || '';
      const targeted = contentEnhancementData?.[`project-${idx}`];
      const enhanced = enhancedProjectSummaries[idx];
      const finalBody = (targeted || enhanced || original || '').trim();
      const bulletMode = finalBody.includes('\n') || /^[•\-\u2013\u2014\*]\s+/.test(finalBody);
      drawLedgerEntry('PROJECT', project.name || 'Project', finalBody, bulletMode, true);
    }
  }

  const bytes = await pdf.save();
  if (bytes.length < 1000) {
    console.error('Generated PDF is too small (style5):', bytes.length, 'bytes');
    return NextResponse.json({ error: 'Generated PDF is too small, please check your content' }, { status: 500 });
  }

  console.log('PDF (style5) generated:', bytes.length, 'bytes');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"'
    }
  });
}
