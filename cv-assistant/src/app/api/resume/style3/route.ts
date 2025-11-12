// app/api/resume/style3/route.ts
// Distinct from style1 & style2:
// - Serif (Times) typography
// - Left shaded sidebar for Contact/Skills/Links
// - Right-column main content (Education, Experience, Projects)
// - En-dash bullets, right-aligned dates, clean rules
// - Optional "crimson" accent color
//
// API contract, enhancement behavior, and stylePreferences compatible with style1/style2.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';
import { PDFDocument, StandardFonts, rgb, type RGB } from 'pdf-lib';

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

  // Debug logging
  console.log('PDF generation request (style3):', {
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
    phone?: string;
    website?: string;
    linkedin?: string;
    languages?: string;
    studyPeriod?: string;
    projects?: Project[];
    experiences?: Experience[];
    workEmail?: string;
  };
  const profile = (user?.profile || {}) as Profile;

  // ---------- Style & enhancement plumbing ----------
  let enhancedSkills: string | undefined;
  const enhancedProjectSummaries: Record<number, string> = {};
  const enhancedExperienceSummaries: Record<number, string> = {};

  let fontSize = 11;
  let useBoldPref = false;
  let useItalicPref = false;
  let contentDensity = 'balanced';
  const accentPref = (stylePreferences?.accentColor as string) || 'black';

  if (stylePreferences) {
    fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
    useBoldPref = !!stylePreferences.useBold;
    useItalicPref = !!stylePreferences.useItalic;
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
      console.warn('Enhancement skipped (style3):', e);
    }
  }

  // ---------- PDF drawing ----------
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]); // Letter
  let { width, height } = page.getSize();

  // Harvardish serif look
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  // Layout constants
  const margin = 54; // 0.75"
  const top = height - margin;
  const bottom = margin;

  // Two-column: left sidebar + right content
  const sidebarWidth = 180;           // left column
  const gutter = 18;                  // space between columns
  const leftX = margin;               // sidebar left
  const leftRightX = leftX + sidebarWidth;
  const rightX = leftRightX + gutter; // main column left
  const rightMaxX = width - margin;   // main column right

  // Y cursors
  let yLeft = top;
  let yRight = top;

  // Accent color (with Harvard crimson default)
  function getAccentColor(): RGB {
    const color = accentPref;
    if (color === 'crimson') return rgb(165 / 255, 28 / 255, 48 / 255);
    if (color === 'dark-blue') return rgb(0.1, 0.2, 0.5);
    if (color === 'dark-gray') return rgb(0.2, 0.2, 0.2);
    if (color === 'dark-green') return rgb(0.1, 0.4, 0.2);
    return rgb(0, 0, 0);
  }
  const accent = getAccentColor();
  const sidebarTint = rgb(0.98, 0.98, 0.98);

  function newPageRight() {
    page = pdf.addPage([612, 792]);
    ({ width, height } = page.getSize());
    // reset main column only; sidebar is rendered on page 1
    yRight = height - margin;

    // Re-draw vertical divider for consistency
    page.drawLine({ start: { x: leftRightX + gutter / 2, y: height - margin }, end: { x: leftRightX + gutter / 2, y: margin }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85)
    });
  }

  function ensureSpaceRight(required: number) {
    if (yRight - required < bottom) newPageRight();
  }

  // Generic text drawers for right column
  function drawRightText(text: string, size = fontSize, bold = false, colorOverride?: RGB) {
    if (!text || !text.trim()) return;
    ensureSpaceRight(size + 6);
    const useBold = bold && useBoldPref ? true : bold; // honor user pref
    const font = useBold ? timesBold : times;
    const color: RGB = colorOverride || rgb(0, 0, 0);
    page.drawText(text, { x: rightX, y: yRight, size, font, color });
    yRight -= size + 6;
  }

  function drawRightRule() {
    ensureSpaceRight(8);
    page.drawLine({ start: { x: rightX, y: yRight }, end: { x: rightMaxX, y: yRight }, thickness: 1, color: accent });
    yRight -= 10;
  }

  function measure(fontObj: { widthOfTextAtSize: (text: string, size: number) => number }, text: string, size: number) {
    return fontObj.widthOfTextAtSize(text, size);
  }

  function drawRightHeaderWithDate(leftText: string, rightText: string, size = fontSize, colorOverride?: RGB) {
    const leftFont = useBoldPref ? timesBold : timesBold;
    const rightFont = times;
    const leftWidth = measure(leftFont, leftText, size);
    const rightWidth = measure(rightFont, rightText, size - 1);
    const maxWidth = rightMaxX - rightX;

    // If too long, shrink left a bit
    let finalSize = size;
    if (leftWidth + 20 + rightWidth > maxWidth) finalSize = Math.max(size - 1, 9);

    ensureSpaceRight(finalSize + 6);
    // Left header
    page.drawText(leftText, { x: rightX, y: yRight, size: finalSize, font: leftFont, color: colorOverride || accent });
    // Right date (right-aligned)
    const dateX = rightMaxX - measure(rightFont, rightText, finalSize - 1);
    if (rightText && rightText.trim()) {
      page.drawText(rightText, { x: dateX, y: yRight, size: finalSize - 1, font: rightFont, color: rgb(0, 0, 0) });
    }
    yRight -= finalSize + 4;
  }

  function drawRightWrapped(text: string, size = fontSize - 1) {
    const font = times;
    const maxWidth = rightMaxX - rightX;
    const words = (text || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    let line = '';


    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        ensureSpaceRight(size + 4);
        page.drawText(line, { x: rightX, y: yRight, size, font });
        yRight -= size + 4;
        line = w;
      } else {
        line = next;
      }
    }
    if (line) {
      ensureSpaceRight(size + 4);
      page.drawText(line, { x: rightX, y: yRight, size, font });
      yRight -= size + 4;
    }
  }

  function drawRightBullets(text: string) {
    // En-dash bullets (distinct from style1/2)
    const size = Math.max(fontSize - 1, 9);
    const bulletChar = '–';
    const bulletIndent = measure(times, `${bulletChar}  `, size);
    const maxWidth = rightMaxX - rightX - bulletIndent;

    function drawOne(content: string) {
      const words = content.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;
      ensureSpaceRight(size + 4);
      // Bullet marker
      page.drawText(bulletChar, { x: rightX, y: yRight, size, font: times, color: rgb(0, 0, 0) });
      // Wrapped bullet text
      let lineWords: string[] = [];
      let lineWidth = 0;
      const spaceW = measure(times, ' ', size);

      for (const w of words) {
        const wW = measure(times, w, size);
        const nextWidth = lineWords.length === 0 ? wW : lineWidth + spaceW + wW;
        if (nextWidth > maxWidth) {
          page.drawText(lineWords.join(' '), { x: rightX + bulletIndent, y: yRight, size, font: times });
          yRight -= size + 4;
          ensureSpaceRight(size + 4);
          lineWords = [w];
          lineWidth = wW;
        } else {
          lineWords.push(w);
          lineWidth = nextWidth;
        }
      }
      if (lineWords.length) {
        page.drawText(lineWords.join(' '), { x: rightX + bulletIndent, y: yRight, size, font: times });
        yRight -= size + 4;
      }
    }

    const lines = (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const looksLikeBullets = lines.some(l => /^[•\-\*\u2013\u2014]/.test(l));
    if (looksLikeBullets) {
      for (const line of lines) {
        const stripped = line.replace(/^[•\-\*\u2013\u2014]\s*/, '');
        if (stripped.trim()) drawOne(stripped);
      }
    } else {
      for (const paragraph of lines) drawOne(paragraph);
    }
  }

  function drawRightSection(title: string) {
    // Section label + rule
    ensureSpaceRight(28);
    page.drawText(title.toUpperCase(), { x: rightX, y: yRight, size: Math.max(fontSize + 1, 12), font: useBoldPref ? timesBold : timesBold, color: accent });
    yRight -= Math.max(fontSize + 1, 12) + 4;
    drawRightRule();
  }

  // ---------- Header & Sidebar (page 1 only) ----------
  const nameText = profile.name || 'Your Name';
  let nameSize = Math.max(fontSize + 7, 18);
  if (stylePreferences?.fontSize && stylePreferences.fontSize !== '11pt') {
    const m = stylePreferences.fontSize.match(/(\d+)pt/);
    if (m) nameSize = Math.max(parseInt(m[1]) + 7, 16);
  }

  // Header: name left, contact right on the top line
  const preferredEmail = profile.workEmail?.trim() ? profile.workEmail : profile.email;
  const contactTop = [preferredEmail, profile.phone].filter(Boolean).join(' • ');
  const contactTopSize = Math.max(fontSize - 1, 9);

  // Draw subtle sidebar background
  page.drawRectangle({ x: leftX - 6, y: margin - 6, width: sidebarWidth + 12, height: height - 2 * margin + 12, color: sidebarTint });

  // Name (top-left)
  page.drawText(nameText, { x: leftX, y: yLeft, size: nameSize, font: timesBold, color: accent });
  // Contact (top-right portion)
  if (contactTop) {
    const wContact = times.widthOfTextAtSize(contactTop, contactTopSize);
    const cx = rightMaxX - wContact;
    page.drawText(contactTop, { x: cx, y: yLeft + Math.max(0, (nameSize - contactTopSize) / 2), size: contactTopSize, font: times });
  }
  yLeft -= nameSize + 6;
  yRight = yLeft; // align main column start with header bottom

  // Thin top rule
  page.drawLine({ start: { x: margin, y: yLeft }, end: { x: width - margin, y: yLeft }, thickness: 1, color: accent });
  
  yLeft -= 12;
  yRight -= 12;

  // Vertical divider line
  page.drawLine({ start: { x: leftRightX + gutter / 2, y: height - margin }, end: { x: leftRightX + gutter / 2, y: margin }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85)
  });

  // Sidebar content (Contact/Links, Skills, Languages)
  function drawSidebarLabel(text: string) {
    const size = Math.max(fontSize - 1, 9);
    page.drawText(text.toUpperCase(), { x: leftX, y: yLeft, size, font: timesBold, color: accent });
    yLeft -= size + 6;
  }

  function drawSidebarLine(text: string, size = Math.max(fontSize - 1, 9)) {
    if (!text || !text.trim()) return;
    const maxWidth = sidebarWidth - 4; // Leave some padding
    const textWidth = times.widthOfTextAtSize(text, size);
    
    // If text fits in sidebar, draw it normally
    if (textWidth <= maxWidth) {
      page.drawText(text, { x: leftX, y: yLeft, size, font: times });
      yLeft -= size + 4;
    } else {
      // Check if this looks like a URL (no spaces, contains common URL patterns)
      const isUrl = /^https?:\/\//.test(text) || (!/\s/.test(text) && (text.includes('.') || text.includes('/')));
      
      if (isUrl) {
        // For URLs, break at character boundaries
        let currentLine = '';
        
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const testLine = currentLine + char;
          const testWidth = times.widthOfTextAtSize(testLine, size);
          
          if (testWidth > maxWidth && currentLine) {
            // Draw current line and start new line
            page.drawText(currentLine, { x: leftX, y: yLeft, size, font: times });
            yLeft -= size + 4;
            currentLine = char;
          } else {
            currentLine = testLine;
          }
        }
        
        // Draw remaining line
        if (currentLine) {
          page.drawText(currentLine, { x: leftX, y: yLeft, size, font: times });
          yLeft -= size + 4;
        }
      } else {
        // For regular text, wrap at word boundaries
        const words = text.split(/\s+/).filter(Boolean);
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const testWidth = times.widthOfTextAtSize(testLine, size);
          
          if (testWidth > maxWidth && currentLine) {
            // Draw current line and start new line
            page.drawText(currentLine, { x: leftX, y: yLeft, size, font: times });
            yLeft -= size + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        // Draw remaining line
        if (currentLine) {
          page.drawText(currentLine, { x: leftX, y: yLeft, size, font: times });
          yLeft -= size + 4;
        }
      }
    }
  }

  // Contact & Links
  drawSidebarLabel('Contact');
  const contactLines: string[] = [];
  if (preferredEmail) contactLines.push(String(preferredEmail));
  if (profile.phone) contactLines.push(String(profile.phone));
  if (profile.website) contactLines.push(String(profile.website));
  if (profile.linkedin) contactLines.push(String(profile.linkedin));
  contactLines.forEach(line => drawSidebarLine(line));

  yLeft -= 6;
  page.drawLine({ start: { x: leftX, y: yLeft }, end: { x: leftRightX, y: yLeft }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  
  yLeft -= 10;

  // Skills
  drawSidebarLabel('Skills');
  let skillsText = (enhancedSkills || skills || '').trim() || (profile.languages || '');
  if (!skillsText) skillsText = '—';
  // Keep it compact in sidebar: split by comma/newline and draw as short lines
  const skillTokens = skillsText.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
  for (const s of skillTokens) drawSidebarLine(`• ${s}`, Math.max(fontSize - 2, 8));

  yLeft -= 6;
  page.drawLine({ start: { x: leftX, y: yLeft }, end: { x: leftRightX, y: yLeft }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  yLeft -= 10;

  // Languages (optional separate field if user also wants it here)
  if (profile.languages && profile.languages.trim() && profile.languages !== skillsText) {
    drawSidebarLabel('Languages');
    for (const lang of profile.languages.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean)) {
      drawSidebarLine(`• ${lang}`, Math.max(fontSize - 2, 8));
    }
    yLeft -= 6;
    page.drawLine({ start: { x: leftX, y: yLeft }, end: { x: leftRightX, y: yLeft }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    yLeft -= 10;
  }

  // ---------- Main content (right column) ----------
  // Education first (Harvard convention)
  if (profile.school || profile.major) {
    drawRightSection('Education');
    const school = profile.school || 'Institution';
    const major = profile.major || '';
    const studyPeriod = (profile.studyPeriod || '').trim();
    drawRightHeaderWithDate(school, studyPeriod, fontSize + 0);
    if (major) drawRightText(major, fontSize - 1, false);
    yRight -= 4;
  }

  // Experience
  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    drawRightSection('Experience');
    for (const idx of selectedExperiences) {
      const ex = profile.experiences?.[idx];
      if (!ex) continue;
      const headerText = `${ex.companyName || ''} — ${ex.role || ''}`.trim();
      const timeInfo = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`.trim();
      drawRightHeaderWithDate(headerText, timeInfo, fontSize + 0);

      const originalContent = (ex.description || ex.summary || '');
      const enhancedContent = enhancedExperienceSummaries[idx];
      const targeted = contentEnhancementData?.[`experience-${idx}`];
      const finalContent = targeted || enhancedContent || originalContent;

      if (finalContent) {
        // If user provided markdown bold, keep simple wrapped text; else bullets
        if (finalContent.includes('**') || finalContent.includes('*')) {
          drawRightWrapped(finalContent, fontSize - 1);
        } else {
          drawRightBullets(finalContent);
        }
      }
      yRight -= 6;
    }
  }

  // Projects
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawRightSection('Projects');
    for (const idx of selectedProjects) {
      const p = profile.projects?.[idx];
      if (!p) continue;
      drawRightText(p.name || 'Untitled Project', fontSize + 0, true, accent);

      const originalContent = (p.description || p.summary || '');
      const enhancedContent = enhancedProjectSummaries[idx];
      const targeted = contentEnhancementData?.[`project-${idx}`];
      const finalContent = targeted || enhancedContent || originalContent;

      if (finalContent) {
        if (finalContent.includes('**') || finalContent.includes('*')) {
          drawRightWrapped(finalContent, fontSize - 1);
        } else {
          drawRightBullets(finalContent);
        }
      }
      yRight -= 6;
    }
  }

  // ---------- Validate & return ----------
  if (yRight < 40 && (!selectedProjects.length && !selectedExperiences.length)) {
    console.error('PDF generation failed: insufficient content (style3).');
    return NextResponse.json({ error: 'Failed to generate PDF: insufficient content' }, { status: 500 });
  }

  const bytes = await pdf.save();
  if (bytes.length < 1000) {
    console.error('Generated PDF is too small (style3):', bytes.length, 'bytes');
    return NextResponse.json({ error: 'Generated PDF is too small, please check your content' }, { status: 500 });
  }

  console.log('PDF (style3) generated:', bytes.length, 'bytes');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"'
    }
  });
}
