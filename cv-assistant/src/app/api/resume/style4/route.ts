// app/api/resume/style4/route.ts
// Dynamic "Card Grid" resume layout with accent banner, skill chips, and two-column cards.
// Compatible with your existing enhance flow and stylePreferences schema.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

  // Debug
  console.log('PDF generation request (style4):', {
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
  if (selectedProjects.length + selectedExperiences.length > 7) {
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
    languages?: string;
    studyPeriod?: string;
    projects?: Project[];
    experiences?: Experience[];
  };
  const profile = (user?.profile || {}) as Profile;

  // ---------- Style & enhancement ----------
  let enhancedSkills: string | undefined;
  const enhancedProjectSummaries: Record<number, string> = {};
  const enhancedExperienceSummaries: Record<number, string> = {};

  let fontSize = 11;
  let contentDensity = 'balanced';
  const accentPref = (stylePreferences?.accentColor as string) || 'teal';

  if (stylePreferences) {
    fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
    contentDensity = stylePreferences.contentDensity || 'balanced';
  }

  if (enhance && stylePreferences) {
    try {
      const model = getModel('gemini-2.5-flash');
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

      // Projects
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

      // Experiences
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
      console.warn('Enhancement skipped (style4):', e);
    }
  }

  // ---------- PDF ----------
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]); // Letter
  let { width, height } = page.getSize();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Layout metrics
  const margin = 48;
  const contentLeft = margin;
  const contentRight = width - margin;
  const top = height - margin;
  const bottom = margin;

  // ---- Accent palette & mixing (no direct access to RGB fields) ----
  type RGBVals = { r: number; g: number; b: number };

  function accentVals(key: string): RGBVals {
    switch (key) {
      case 'crimson':   return { r: 165/255, g: 28/255,  b: 48/255 };
      case 'dark-blue': return { r: 0.1,     g: 0.2,     b: 0.5 };
      case 'dark-gray': return { r: 0.2,     g: 0.2,     b: 0.2 };
      case 'dark-green':return { r: 0.1,     g: 0.4,     b: 0.2 };
      default:          return { r: 0/255,   g: 0/255, b: 0/255 }; 
    }
  }

  function mixVals(a: RGBVals, b: RGBVals, t: number): RGBVals {
    return {
      r: a.r * (1 - t) + b.r * t,
      g: a.g * (1 - t) + b.g * t,
      b: a.b * (1 - t) + b.b * t,
    };
  }

  const ACCENT_V       = accentVals(accentPref);
  const ACCENT         = rgb(ACCENT_V.r, ACCENT_V.g, ACCENT_V.b);
  const ACCENT_DARK_V  = mixVals(ACCENT_V, { r: 0, g: 0, b: 0 }, 0.25);
  const ACCENT_LIGHT_V = mixVals(ACCENT_V, { r: 1, g: 1, b: 1 }, 0.6);
  const ACCENT_DARK    = rgb(ACCENT_DARK_V.r,  ACCENT_DARK_V.g,  ACCENT_DARK_V.b);
  const ACCENT_LIGHT   = rgb(ACCENT_LIGHT_V.r, ACCENT_LIGHT_V.g, ACCENT_LIGHT_V.b);

  // Other static colors:
  const CARD_BG = rgb(0.99, 0.99, 0.995);
  const SHADOW  = rgb(0.85, 0.85, 0.9);


  // Header banner
  const bannerH = 62;
  page.drawRectangle({ x: margin, y: top - bannerH, width: contentRight - contentLeft, height: bannerH, color: ACCENT_DARK });
  page.drawRectangle({ x: margin, y: top - bannerH, width: contentRight - contentLeft, height: 8, color: ACCENT_LIGHT });

  // Name and contact
  const nameText = profile.name || 'Your Name';
  let nameSize = Math.max(fontSize + 9, 20);
  if (stylePreferences?.fontSize && stylePreferences.fontSize !== '11pt') {
    const m = stylePreferences.fontSize.match(/(\d+)pt/);
    if (m) nameSize = Math.max(parseInt(m[1]) + 9, 18);
  }
  const preferredEmail = profile.workEmail?.trim() ? profile.workEmail : profile.email;
  const contactItems = [preferredEmail, profile.phone, profile.website, profile.linkedin].filter(Boolean);
  const contactSize = Math.max(fontSize - 1, 9);

  // Calculate available space for contact info (right side of banner)
  const nameWidth = helvBold.widthOfTextAtSize(nameText, nameSize);
  const nameRightEdge = contentLeft + 14 + nameWidth + 20; // 20pt gap between name and contact
  const contactMaxWidth = contentRight - nameRightEdge - 14; // Available width for contact

  // Name (white, left) - vertically centered in banner
  const nameY = top - bannerH + (bannerH - nameSize) / 2 + nameSize;
  page.drawText(nameText, { x: contentLeft + 14, y: nameY, size: nameSize, font: helvBold, color: rgb(1, 1, 1) });

  // Contact (white, right) - wrap if needed
  if (contactItems.length > 0) {
    const contactText = contactItems.join(' • ');
    const contactWidth = helv.widthOfTextAtSize(contactText, contactSize);
    
    // If contact fits on one line, draw it normally
    if (contactWidth <= contactMaxWidth) {
      const contactX = contentRight - contactWidth - 14;
      const contactY = nameY; // Align with name baseline
      page.drawText(contactText, { x: contactX, y: contactY, size: contactSize, font: helv, color: rgb(1, 1, 1) });
    } else {
      // Wrap contact info to multiple lines
      // Split by bullet separator and wrap each segment
      const segments = contactText.split(' • ');
      let currentLine = '';
      let lineY = nameY;
      const lineHeight = contactSize + 2;
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const testLine = currentLine ? currentLine + ' • ' + segment : segment;
        const testWidth = helv.widthOfTextAtSize(testLine, contactSize);
        
        if (testWidth > contactMaxWidth && currentLine) {
          // Draw current line and start new line
          const lineX = contentRight - helv.widthOfTextAtSize(currentLine, contactSize) - 14;
          page.drawText(currentLine, { x: lineX, y: lineY, size: contactSize, font: helv, color: rgb(1, 1, 1) });
          lineY -= lineHeight;
          currentLine = segment;
        } else {
          currentLine = testLine;
        }
      }
      
      // Draw remaining line
      if (currentLine) {
        const lineX = contentRight - helv.widthOfTextAtSize(currentLine, contactSize) - 14;
        page.drawText(currentLine, { x: lineX, y: lineY, size: contactSize, font: helv, color: rgb(1, 1, 1) });
      }
    }
  }

  // Beautify markdown
  function stripMdKeepNewlines(s: string): string {
    return (s || '')
      // remove list markers at line starts, including '*' variants
      .replace(/^\s*[\*\-\u2013\u2014•]\s+/gm, '')
      // basic markdown emphasis
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  // Skills chips row (under banner)
  let y = top - bannerH - 16;
  const labelSize = Math.max(fontSize, 10);
  page.drawText('SKILLS', { x: contentLeft, y, size: labelSize, font: helvBold, color: ACCENT });
  y -= labelSize + 7;

  let skillsText = (enhancedSkills || skills || '').trim() || (profile.languages || '');
  if (!skillsText) skillsText = '—';
  const chipTokens = stripMdKeepNewlines(skillsText)
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
  function drawChips(tokens: string[], startX: number, startY: number, lineHeight: number, maxWidth: number) {
    let cx = startX;
    let cy = startY;
    const padX = 6;
    const padY = 3;
    const chipSize = Math.max(fontSize - 1, 9);
    for (const t of tokens) {
      const textW = helv.widthOfTextAtSize(t, chipSize);
      const chipW = textW + padX * 2;
      const chipH = chipSize + padY * 2;
      if (cx + chipW > maxWidth) {
        // wrap
        cx = startX;
        cy -= (chipH + 6);
      }
      // shadow (remove opacity if pdf-lib not supporting it)
      page.drawRectangle({ x: cx + 1, y: cy - 1, width: chipW, height: chipH, color: SHADOW, opacity: 0.25 });
      // chip
      page.drawRectangle({ x: cx, y: cy, width: chipW, height: chipH, color: CARD_BG, borderColor: ACCENT_LIGHT, borderWidth: 0.75 });
      // text
      page.drawText(t, { x: cx + padX, y: cy + padY, size: chipSize, font: helv, color: rgb(0, 0, 0) });
      cx += chipW + 6;
    }
    return cy - (chipSize + padY * 2 + 10);
  }
  y = drawChips(chipTokens, contentLeft, y, Math.max(fontSize + 4, 14), contentRight);

  // Two-column grid for cards
  const gutter = 18;
  const colW = ((contentRight - contentLeft) - gutter) / 2;
  const colX = [contentLeft, contentLeft + colW + gutter];
  // Initialize colY from chips
  let colY: number[] = [y, y];
  // If the chips pushed below bottom margin, start a new page
  if (y < bottom + 60) {
    newPageGrid(true);   // this sets colY internally
  } else {
    // only set colY here if we didn't break page
    colY = [y, y];
  }

  function newPageGrid(repeatHeader = true) {
    page = pdf.addPage([612, 792]);
    ({ width, height } = page.getSize());

    // Compact header bar for subsequent pages
    if (repeatHeader) {
      const h = 28;
      page.drawRectangle({ x: margin, y: height - margin - h, width: contentRight - contentLeft, height: h, color: ACCENT_DARK });
      const mini = `${profile.name || 'Your Name'} — ${profile.major || ''}`;
      const miniSize = Math.max(fontSize, 10);
      const miniY = height - margin - h + miniSize;
      page.drawText(mini, { x: contentLeft + 12, y: miniY, size: miniSize, font: helvBold, color: rgb(1, 1, 1) });
      
      if (contactItems.length > 0) {
        const contactText = contactItems.join(' • ');
        const miniContactSize = Math.max(fontSize - 1, 9);
        const miniNameWidth = helvBold.widthOfTextAtSize(mini, miniSize);
        const miniNameRightEdge = contentLeft + 12 + miniNameWidth + 20;
        const miniContactMaxWidth = contentRight - miniNameRightEdge - 12;
        const miniContactWidth = helv.widthOfTextAtSize(contactText, miniContactSize);
        
        if (miniContactWidth <= miniContactMaxWidth) {
          const miniContactX = contentRight - miniContactWidth - 12;
          page.drawText(contactText, { x: miniContactX, y: miniY, size: miniContactSize, font: helv, color: rgb(1, 1, 1) });
        } else {
          // Wrap contact info for subsequent pages too
          const segments = contactText.split(' • ');
          let currentLine = '';
          let lineY = miniY;
          const lineHeight = miniContactSize + 2;
          
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const testLine = currentLine ? currentLine + ' • ' + segment : segment;
            const testWidth = helv.widthOfTextAtSize(testLine, miniContactSize);
            
            if (testWidth > miniContactMaxWidth && currentLine) {
              const lineX = contentRight - helv.widthOfTextAtSize(currentLine, miniContactSize) - 12;
              page.drawText(currentLine, { x: lineX, y: lineY, size: miniContactSize, font: helv, color: rgb(1, 1, 1) });
              lineY -= lineHeight;
              currentLine = segment;
            } else {
              currentLine = testLine;
            }
          }
          
          if (currentLine) {
            const lineX = contentRight - helv.widthOfTextAtSize(currentLine, miniContactSize) - 12;
            page.drawText(currentLine, { x: lineX, y: lineY, size: miniContactSize, font: helv, color: rgb(1, 1, 1) });
          }
        }
      }
      
      colY = [height - margin - h - 20, height - margin - h - 20];
    } else {
      colY = [height - margin, height - margin];
    }
  }

  function ensureColumnSpace(col: 0 | 1, needed: number) {
    if (colY[col] - needed < bottom) {
      // try the other column
      const other: 0 | 1 = col === 0 ? 1 : 0;
      if (colY[other] - needed >= bottom) return other;
      // new page
      newPageGrid(true);
      return 0;
    }
    return col;
  }

  // Helpers: wrap measurement & drawing
  function measureWrapped(text: string, size: number, maxWidth: number, font = helv) {
    const words = (text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return 0;
    let line = '';
    let lines = 0;
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        lines++;
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines++;
    return lines * (size + 4);
  }
  function drawWrappedAt(x: number, yRef: { v: number }, text: string, size: number, maxWidth: number, font = helv) {
    const words = (text || '').split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        page.drawText(line, { x, y: yRef.v, size, font });
        yRef.v -= size + 4;
        line = w;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x, y: yRef.v, size, font });
      yRef.v -= size + 4;
    }
  }
  function measureBullets(text: string, size: number, maxWidth: number) {
    text = stripMdKeepNewlines(text);
    const lines = (text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    let h = 0;
    const bullet = '•';
    const bulletIndent = helv.widthOfTextAtSize(`${bullet}  `, size);
    for (const ln of lines) {
      const t = ln.replace(/^[•\-\u2013\u2014\*]\s*/, ''); // NOTE: added \*
      h += measureWrapped(t, size, maxWidth - bulletIndent);
    }
    return h + lines.length * 2;
  }
  function drawBulletsAt(x: number, yRef: { v: number }, text: string, size: number, maxWidth: number) {
    text = stripMdKeepNewlines(text);
    const lines = (text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const bullet = '•';
    const bulletIndent = helv.widthOfTextAtSize(`${bullet}  `, size);
    for (const ln of lines) {
      const t = ln.replace(/^[•\-\u2013\u2014\*]\s*/, ''); // NOTE: added \*
      page.drawText(bullet, { x, y: yRef.v, size, font: helvBold, color: ACCENT });
      const tmp = { v: yRef.v };
      drawWrappedAt(x + bulletIndent, tmp, t, size, maxWidth - bulletIndent, helv);
      yRef.v = tmp.v;
    }
  }
  

  // Card renderer
  function estimateCardHeight(title: string, metaRight: string, body: string, bodyIsBullets: boolean) {
    const pad = 10;
    const ttlSize = Math.max(fontSize + 1, 12);
    const bodySize = Math.max(fontSize - 1, 10);
    const textW = colW - pad * 2;

    let h = pad; // top pad
    h += ttlSize + 4; // title row
    if (metaRight) h += 0; // same row
    h += 6; // gap
    if (body) {
      h += bodyIsBullets ? measureBullets(body, bodySize, textW) : measureWrapped(body, bodySize, textW);
    }
    h += pad; // bottom pad
    return h + 6; // extra spacing
  }

  // Title styler with wrap
  function drawTitleWithWrap(title: string, metaRight: string, x: number, y: number, maxWidth: number, titleSize: number) {
    const metaSize = Math.max(titleSize - 1, 9);
    const metaWidth = metaRight ? helv.widthOfTextAtSize(metaRight, metaSize) + 12 : 0;
    const words = (title || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    // Wrap: first line reserves space for date
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      const testWidth = helvBold.widthOfTextAtSize(test, titleSize);
      const limit = lines.length === 0 ? maxWidth - metaWidth : maxWidth;
      if (testWidth > limit && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    // Draw first line with date
    page.drawText(lines[0], { x, y, size: titleSize, font: helvBold, color: ACCENT_DARK });
    if (metaRight) {
      const mW = helv.widthOfTextAtSize(metaRight, metaSize);
      page.drawText(metaRight, { x: x + maxWidth - mW, y, size: metaSize, font: helv, color: rgb(0.15,0.15,0.18) });
    }
    // Draw remaining lines
    let yy = y;
    for (let i = 1; i < lines.length; i++) {
      yy -= titleSize + 2;
      page.drawText(lines[i], { x, y: yy, size: titleSize, font: helvBold, color: ACCENT_DARK });
    }
    // Drop cursor further down to avoid merging with body
    return yy - (titleSize + 6);
  }
  
  
  function drawCard(col: 0 | 1, title: string, metaRight: string, body: string, bodyIsBullets: boolean) {
    const pad = 10;
    const ttlSize = Math.max(fontSize, 10);
    const metaSize = Math.max(fontSize - 1, 9);
    const bodySize = Math.max(fontSize - 1, 10);
    // each card’s available width = column width minus padding
    const w = colW;

    const needed = estimateCardHeight(title, metaRight, body, bodyIsBullets);
    const targetCol = ensureColumnSpace(col, needed) as 0 | 1;

    const x = colX[targetCol];
    const yTop = colY[targetCol];

    // shadow + card
    page.drawRectangle({ x: x + 2, y: yTop - needed + 2, width: w, height: needed, color: SHADOW, opacity: 0.2 });
    page.drawRectangle({ x, y: yTop - needed, width: w, height: needed, color: CARD_BG, borderColor: ACCENT_LIGHT, borderWidth: 0.75 });

    // header bar (thin)
    page.drawRectangle({ x, y: yTop - 3, width: w, height: 3, color: ACCENT });

    // Title + meta
    const yRef = { v: yTop - pad - Math.max(ttlSize, metaSize) };
    yRef.v = drawTitleWithWrap(title, metaRight, x + pad, yRef.v, w - pad * 2, ttlSize);

    // Body
    if (body) {
      if (bodyIsBullets) drawBulletsAt(x + pad, yRef, body, bodySize, w - pad * 2);
      else drawWrappedAt(x + pad, yRef, stripMdKeepNewlines(body), bodySize, w - pad * 2, helv);
    }

    // update column cursor (leave a gap after)
    colY[targetCol] = yTop - needed - 8;
    return targetCol === 0 ? 1 : 0; // alternate columns for a dynamic layout
  }

  // ----- EDUCATION (as a card, first) -----
  let nextCol: 0 | 1 = 0;
  if (profile.school || profile.major) {
    const school = profile.school || 'Institution';
    const studyPeriod = (profile.studyPeriod || '').trim();
    const major = profile.major || '';
    const body = major ? major : '';
    nextCol = drawCard(0, school, studyPeriod, body, false);
  }

  // ----- EXPERIENCE -----
  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    for (const idx of selectedExperiences) {
      const ex = profile.experiences?.[idx];
      if (!ex) continue;
      const header = `${ex.companyName || ''} — ${ex.role || ''}`.trim();
      const timeInfo = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`.trim();
      const original = (ex.description || ex.summary || '');
      const enhanced = enhancedExperienceSummaries[idx];
      const targeted = contentEnhancementData?.[`experience-${idx}`];
      const finalBody = (targeted || enhanced || original || '').trim();
      const isBullets = finalBody.includes('\n') || /^[•\-\u2013\u2014]\s+/.test(finalBody);
      nextCol = drawCard(nextCol, header || 'Experience', timeInfo, finalBody, isBullets);
    }
  }

  // ----- PROJECTS -----
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    for (const idx of selectedProjects) {
      const p = profile.projects?.[idx];
      if (!p) continue;
      const original = (p.description || p.summary || '');
      const enhanced = enhancedProjectSummaries[idx];
      const targeted = contentEnhancementData?.[`project-${idx}`];
      const finalBody = (targeted || enhanced || original || '').trim();
      const isBullets = finalBody.includes('\n') || /^[•\-\u2013\u2014]\s+/.test(finalBody);
      nextCol = drawCard(nextCol, p.name || 'Project', '', finalBody, isBullets);
    }
  }

  // Validate & return
  const bytes = await pdf.save();
  if (bytes.length < 1000) {
    console.error('Generated PDF is too small (style4):', bytes.length, 'bytes');
    return NextResponse.json({ error: 'Generated PDF is too small, please check your content' }, { status: 500 });
  }

  console.log('PDF (style4) generated:', bytes.length, 'bytes');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"'
    }
  });
}
