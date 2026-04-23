import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/ai';
import { MAX_RESUME_ITEMS } from '@/lib/resume/constants';
import { formatResumeProfileParagraph, resolveResumeProfileText } from '@/lib/resume/profile';
import { formatResumeSkillsParagraph, resolveResumeSkillsText } from '@/lib/resume/skills';
import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import { embedNotoSansFonts } from '@/app/api/resume/embed-noto-sans-fonts';
import { buildJustifiedTextLines, wrapTextLines } from '@/app/api/resume/pdf-layout';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { skills, selectedProjects, selectedExperiences, enhance, qa, stylePreferences, contentEnhancementData } = await req.json();
  
  // Debug logging
  console.log('PDF generation request:', {
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
  
  // Validate that at least some content is selected
  if (selectedProjects.length === 0 && selectedExperiences.length === 0) {
    return NextResponse.json({ error: 'Please select at least one project or experience' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  type Project = { name?: string; summary?: string; description?: string };
  type Experience = { companyName?: string; role?: string; summary?: string; description?: string; timeFrom?: string; timeTo?: string };
  type Profile = { name?: string; major?: string; school?: string; email?: string; phone?: string; website?: string; linkedin?: string; profileSummary?: string; skills?: string; languages?: string; projects?: Project[]; experiences?: Experience[] };
  const profile = (user?.profile || {}) as Profile;

  // Parse style preferences and enhance content if requested
  let enhancedSkills: string | undefined = undefined;
  const enhancedProjectSummaries: Record<number, string> = {};
  const enhancedExperienceSummaries: Record<number, string> = {};
  let fontSize = 11;
  let useBold = false;
  let contentDensity = 'balanced';
  
  // Always parse style preferences if available, regardless of enhance flag
  if (stylePreferences) {
    fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
    useBold = stylePreferences.useBold || false;
    contentDensity = stylePreferences.contentDensity || 'balanced';
  }
  
  if (enhance && stylePreferences) {
    try {
      // Parse style preferences
      fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
      useBold = stylePreferences.useBold || false;
      contentDensity = stylePreferences.contentDensity || 'balanced';
      
      // Motivation vs Logic:
      // Motivation: Resume enhancement touches multiple sections and should keep one stronger text model for
      // higher-signal rewriting while the rest of the app can default to cheaper lightweight calls.
      // Logic: This route stays on the shared `hard` preset so the Azure model choice remains centralized in
      // `src/lib/ai.ts`, while section-specific prompts and downstream summarize/enhance flows remain unchanged.
      const model = getModel('hard');
      async function improve(prompt: string) {
        const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        return res.response.text().trim();
      }
      
      const qaNotes = Array.isArray(qa) && qa.length ? `\nContext from Q&A (user and assistant messages):\n${qa.map((m: { role: string; content: string })=>`[${m.role}] ${m.content}`).join('\n')}` : '';
      
      if (skills) {
        enhancedSkills = await improve(`Rewrite these skills as a concise comma-separated list, removing redundancy and keeping professional tone.${qaNotes}\nSkills:\n${skills}`);
      }
      
      // Process projects in chunks to avoid overload
      if (Array.isArray(profile.projects) && selectedProjects.length > 0) {
        const chunkSize = Math.ceil(selectedProjects.length / 2);
        for (let i = 0; i < selectedProjects.length; i += chunkSize) {
          const chunk = selectedProjects.slice(i, i + chunkSize);
          for (const idx of chunk) {
            const p = profile.projects[idx];
            if (!p) continue;
            const base = p.summary || '';
            let improved = await improve(`Improve these resume bullet points for a project in crisp, high-impact bullets (2-3 bullets max). Keep content precise, factual, and ATS-friendly. Return only bullets separated by newlines.${qaNotes}\nProject name: ${p.name||''}\nBullets/summary to improve:\n${base}`);
            
            // Apply content density processing
            if (contentDensity === 'concise') {
              const summaryRes = await fetch(`${req.nextUrl.origin}/api/resume/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'project' })
              });
              if (summaryRes.ok) {
                const summaryData = await summaryRes.json();
                improved = summaryData.summarizedContent;
              }
            } else if (contentDensity === 'detailed') {
              const enhanceRes = await fetch(`${req.nextUrl.origin}/api/resume/enhance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'project', qaContext: qaNotes })
              });
              if (enhanceRes.ok) {
                const enhanceData = await enhanceRes.json();
                improved = enhanceData.enhancedContent;
              }
            }
            
            enhancedProjectSummaries[idx] = improved;
          }
        }
      }
      
      // Process experiences in chunks to avoid overload
      if (Array.isArray(profile.experiences) && selectedExperiences.length > 0) {
        const chunkSize = Math.ceil(selectedExperiences.length / 2);
        for (let i = 0; i < selectedExperiences.length; i += chunkSize) {
          const chunk = selectedExperiences.slice(i, i + chunkSize);
          for (const idx of chunk) {
            const ex = profile.experiences[idx];
            if (!ex) continue;
            const base = ex.summary || '';
            let improved = await improve(`Improve these resume bullet points for a work experience in crisp, high-impact bullets (2-3 bullets max). Use quantified achievements when possible. Return only bullets separated by newlines.${qaNotes}\nCompany: ${ex.companyName||''}\nRole: ${ex.role||''}\nBullets/summary to improve:\n${base}`);
            
            // Apply content density processing
            if (contentDensity === 'concise') {
              const summaryRes = await fetch(`${req.nextUrl.origin}/api/resume/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'experience' })
              });
              if (summaryRes.ok) {
                const summaryData = await summaryRes.json();
                improved = summaryData.summarizedContent;
              }
            } else if (contentDensity === 'detailed') {
              const enhanceRes = await fetch(`${req.nextUrl.origin}/api/resume/enhance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: improved, contentType: 'experience', qaContext: qaNotes })
              });
              if (enhanceRes.ok) {
                const enhanceData = await enhanceRes.json();
                improved = enhanceData.enhancedContent;
              }
            }
            
            enhancedExperienceSummaries[idx] = improved;
          }
        }
      }
    } catch {}
  }

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]); // Letter size
  let { width, height } = page.getSize();
  const { regular: notoSans, bold: notoSansBold } = await embedNotoSansFonts(pdf);

  // Style2: Even margins on all sides for perfectly aligned text blocks
  const leftMargin = 64;
  const rightMargin = 64;
  const topMargin = 64;
  const bottomMargin = 64;
  
  const left = leftMargin;
  const right = width - rightMargin;
  const bottom = bottomMargin;
  const top = height - topMargin;
  let y = top;
  const contentWidth = right - left;

  function newPage() {
    page = pdf.addPage([612, 792]);
    ({ width, height } = page.getSize());
    y = height - topMargin;
  }

  function ensureSpace(required: number) {
    if (y - required < bottom) newPage();
  }

  function getAccentColor(): RGB {
    const color = stylePreferences?.accentColor || 'black';
    if (color === 'dark-blue') return rgb(0.1, 0.2, 0.5);
    if (color === 'dark-gray') return rgb(0.2, 0.2, 0.2);
    if (color === 'crimson') return rgb(0.6, 0.1, 0.1);
    if (color === 'dark-green') return rgb(0.1, 0.4, 0.2);
    return rgb(0, 0, 0);
  }

  function drawWrappedLines(
    lines: string[],
    x: number,
    size = 11,
    bold = false,
    colorOverride?: RGB,
    lineGap = 6
  ) {
    if (!lines.length) return;
    const font = bold ? notoSansBold : notoSans;
    const color: RGB = colorOverride || rgb(0, 0, 0);
    for (const line of lines) {
      ensureSpace(size + lineGap);
      page.drawText(line, { x, y, size, font, color });
      y -= size + lineGap;
    }
  }

  function drawWrappedTextBlock(text: string, size = 11, bold = false, colorOverride?: RGB) {
    const lines = wrapTextLines(text, bold ? notoSansBold : notoSans, size, contentWidth);
    drawWrappedLines(lines, left, size, bold, colorOverride);
  }

  function drawJustifiedParagraph(text: string, size = 10) {
    const lines = buildJustifiedTextLines(text, notoSans, size, contentWidth);
    for (const line of lines) {
      ensureSpace(size + 6);
      if (line.justify) {
        drawJustifiedLine(line.words, left, size, true);
      } else {
        page.drawText(line.text, { x: left, y, size, font: notoSans });
      }
      y -= size + 6;
    }
  }

  function drawLabelValueLine(label: string, value: string, size = 10) {
    const cleanValue = value.trim();
    if (!cleanValue) return;
    const labelText = `${label}:`;
    const labelWidth = notoSansBold.widthOfTextAtSize(`${labelText} `, size);
    const firstLineMaxWidth = Math.max(contentWidth - labelWidth, 60);
    const valueLines = wrapTextLines(cleanValue, notoSans, size, firstLineMaxWidth);
    if (!valueLines.length) return;

    ensureSpace(size + 6);
    page.drawText(`${labelText} `, { x: left, y, size, font: notoSansBold });
    page.drawText(valueLines[0], { x: left + labelWidth, y, size, font: notoSans });
    y -= size + 6;

    if (valueLines.length > 1) {
      drawWrappedLines(valueLines.slice(1), left, size, false);
    }
  }

  function drawHeaderRow(leftText: string, rightText: string, leftSize = fontSize, rightSize = fontSize, colorOverride?: RGB) {
    const normalizedLeft = leftText.trim();
    const normalizedRight = rightText.trim();
    if (!normalizedLeft && !normalizedRight) return;

    const gap = 18;
    const rightWidth = normalizedRight ? notoSans.widthOfTextAtSize(normalizedRight, rightSize) : 0;
    const sameRowMaxWidth = normalizedRight
      ? Math.max(contentWidth - rightWidth - gap, contentWidth * 0.55)
      : contentWidth;
    const sameRowLines = normalizedLeft
      ? wrapTextLines(normalizedLeft, useBold ? notoSansBold : notoSans, leftSize, sameRowMaxWidth)
      : [];

    if (normalizedLeft && (!normalizedRight || sameRowLines.length === 1)) {
      ensureSpace(Math.max(leftSize, rightSize) + 6);
      page.drawText(sameRowLines[0], {
        x: left,
        y,
        size: leftSize,
        font: useBold ? notoSansBold : notoSans,
        color: colorOverride || getAccentColor()
      });
      if (normalizedRight) {
        page.drawText(normalizedRight, {
          x: right - rightWidth,
          y,
          size: rightSize,
          font: notoSans,
          color: rgb(0, 0, 0)
        });
      }
      y -= Math.max(leftSize, rightSize) + 6;
      return;
    }

    if (normalizedLeft) {
      drawWrappedTextBlock(normalizedLeft, leftSize, useBold, colorOverride || getAccentColor());
    }
    if (normalizedRight) {
      const rightLines = wrapTextLines(normalizedRight, notoSans, rightSize, contentWidth);
      for (const line of rightLines) {
        const lineWidth = notoSans.widthOfTextAtSize(line, rightSize);
        ensureSpace(rightSize + 6);
        page.drawText(line, { x: right - lineWidth, y, size: rightSize, font: notoSans });
        y -= rightSize + 6;
      }
    }
  }

  function drawMarkdownText(text: string, x: number, size = 11) {
    // Apply styling preferences
    let finalSize = size;
    let allowBold = true;
    if (stylePreferences) {
      if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
        const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
        if (sizeMatch) finalSize = parseInt(sizeMatch[1]);
      }
      if (stylePreferences.useBold !== undefined) allowBold = stylePreferences.useBold;
    }

    // Normalize line breaks into paragraphs
    const paragraphs = (text || '').split(/\n+/).filter(Boolean);
    for (const paragraph of paragraphs) {
      // Tokenize paragraph by markdown markers into segments with flags
      const segsRaw = paragraph.split(/(\*\*.*?\*\*|\*.*?\*)/);
      type Seg = { text: string; bold: boolean };
      const segments: Seg[] = [];
      for (const s of segsRaw) {
        if (!s) continue;
        if (s.startsWith('**') && s.endsWith('**')) {
          const content = s.slice(2, -2);
          segments.push({ text: content, bold: allowBold });
        } else if (s.startsWith('*') && s.endsWith('*')) {
          const content = s.slice(1, -1);
          // No italics font in pdf-lib default; keep regular weight
          segments.push({ text: content, bold: false });
        } else {
          segments.push({ text: s, bold: false });
        }
      }

      // Split into word tokens preserving bold flag
      type Token = { text: string; bold: boolean };
      const tokens: Token[] = [];
      for (const seg of segments) {
        const words = seg.text.split(/(\s+)/).filter(w => w.length > 0);
        for (const w of words) tokens.push({ text: w, bold: seg.bold });
      }

      // Build lines with wrapping
      const maxWidth = right - left;
      let line: Token[] = [];
      let lineWidth = 0;
      const widthOf = (t: Token) => (t.bold ? notoSansBold : notoSans).widthOfTextAtSize(t.text, finalSize);
      const isSpace = (t: Token) => /^\s+$/.test(t.text);

      const flushLine = (justify: boolean) => {
        if (line.length === 0) return;
        ensureSpace(finalSize + 4);
        if (!justify) {
          // Left draw
          let cx = x;
          for (const tk of line) {
            const f = tk.bold ? notoSansBold : notoSans;
            page.drawText(tk.text, { x: cx, y, size: finalSize, font: f });
            cx += widthOf(tk);
          }
        } else {
          // Distribute extra space across space tokens
          const naturalWidth = line.reduce((acc, tk) => acc + widthOf(tk), 0);
          const spaces = line.filter(isSpace);
          const extra = Math.max(0, maxWidth - (naturalWidth));
          const extraPerSpace = spaces.length > 0 ? extra / spaces.length : 0;
          let cx = x;
          for (const tk of line) {
            const f = tk.bold ? notoSansBold : notoSans;
            page.drawText(tk.text, { x: cx, y, size: finalSize, font: f });
            let add = widthOf(tk);
            if (extraPerSpace && isSpace(tk)) add += extraPerSpace;
            cx += add;
          }
        }
        y -= finalSize + 4;
        line = [];
        lineWidth = 0;
      };

      for (const tk of tokens) {
        const w = widthOf(tk);
        if (lineWidth + w > maxWidth && line.length > 0) {
          // flush current line (justify except if only one word)
          const justify = line.some(isSpace) && line.filter(t => !isSpace(t)).length > 1;
          flushLine(justify);
        }
        line.push(tk);
        lineWidth += w;
      }
      // Last line not justified
      flushLine(false);
    }
  }

  function drawSection(title: string) {
    ensureSpace(40); // Style2: More space before sections
    y -= 12; // Style2: More space above section title
    
    // Apply styling preferences to section titles
    let titleSize = 13; // Style2: Slightly larger section titles
    let useBold = true;
    
    if (stylePreferences) {
      if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
        const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
        if (sizeMatch) {
          titleSize = Math.max(parseInt(sizeMatch[1]) + 2, 11); // Section titles larger than style1
        }
      }
      if (stylePreferences.useBold !== undefined) {
        useBold = stylePreferences.useBold;
      }
    }
    
    const font = useBold ? notoSansBold : notoSans;
    const titleUpper = title.toUpperCase();
    const titleWidth = font.widthOfTextAtSize(titleUpper, titleSize);
    // Center the title within the content area (between left and right margins)
    const titleX = left + (right - left - titleWidth) / 2;
    page.drawText(titleUpper, { x: titleX, y, size: titleSize, font, color: getAccentColor() });
    y -= titleSize + 8; // Style2: More space after title
    
    // Full-width underline between content margins
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.2, color: getAccentColor() });
    y -= 12; // Style2: More space after line
  }

  function drawJustifiedLine(words: string[], x: number, size: number, justify: boolean) {
    const maxWidth = right - left;
    const spaceWidth = notoSans.widthOfTextAtSize(' ', size);
    const textWidth = notoSans.widthOfTextAtSize(words.join(' '), size);
    if (!justify || words.length <= 1 || textWidth >= maxWidth) {
      page.drawText(words.join(' '), { x, y, size, font: notoSans });
      return;
    }
    const extra = (maxWidth - textWidth) / (words.length - 1);
    let cursor = x;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      page.drawText(w, { x: cursor, y, size, font: notoSans });
      if (i < words.length - 1) {
        cursor += notoSans.widthOfTextAtSize(w, size) + spaceWidth + extra;
      }
    }
  }

  function drawBulletBlock(text: string) {
    let size = 10;
    
    // Apply styling preferences
    if (stylePreferences && stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
      const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
      if (sizeMatch) {
        size = parseInt(sizeMatch[1]);
      }
    }
    
    // Style2: Use a drawn square bullet to avoid WinAnsi encoding issues
    const bulletBox = Math.max(size * 0.22, 2.5); // square size in points
    const bulletGap = Math.max(size * 0.6, 5);    // gap between square and text
    const bulletIndent = bulletBox + bulletGap;
    const maxWidth = right - left - bulletIndent;

    function drawOneBullet(content: string) {
      const words = (content || '').split(/\s+/).filter(Boolean);
      if (words.length === 0) return;
      ensureSpace(size + 6); // Style2: More space between bullets
      // Draw square bullet marker (filled)
      const bulletY = y + (size - bulletBox) / 2 - 1; // vertically center roughly to text
      page.drawRectangle({ x: left, y: bulletY, width: bulletBox, height: bulletBox, color: getAccentColor() });
      let lineWords: string[] = [];
      let lineWidth = 0;
      const spaceWidth = notoSans.widthOfTextAtSize(' ', size);
      for (const w of words) {
        const wWidth = notoSans.widthOfTextAtSize(w, size);
        const nextWidth = lineWords.length === 0 ? wWidth : lineWidth + spaceWidth + wWidth;
        if (nextWidth > maxWidth) {
          // Draw justified line for bullet text
          drawJustifiedLine(lineWords, left + bulletIndent, size, true);
          y -= size + 6; // Style2: More space between lines
          ensureSpace(size + 6);
          // Maintain visual flow on wrapped bullet lines
          // (no extra drawing needed besides line spacing)
          lineWords = [w];
          lineWidth = wWidth;
        } else {
          lineWords.push(w);
          lineWidth = nextWidth;
        }
      }
      if (lineWords.length) {
        // Last line of bullet not justified
        page.drawText(lineWords.join(' '), { x: left + bulletIndent, y, size, font: notoSans });
        y -= size + 6; // Style2: More space after bullet
      }
    }

    // Preserve multiple bullets if present
    const lines = (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const looksLikeBullets = lines.some(l => /^[•\-\*\u2013\u2014▪]/.test(l));
    
    if (looksLikeBullets) {
      // Process each bullet point separately to maintain line breaks
      for (const line of lines) {
        const stripped = line.replace(/^[•\-\*\u2013\u2014▪]\s*/, '');
        if (stripped.trim()) {
          drawOneBullet(stripped);
        }
      }
    } else {
      // If no bullet markers, treat as regular text with potential line breaks
      const paragraphs = text.split(/\n+/).filter(p => p.trim());
      for (const paragraph of paragraphs) {
        if (paragraph.trim()) {
          drawOneBullet(paragraph.trim());
        }
      }
    }
  }

  // Style2: Header with different layout
  // Name centered but with different spacing
  ensureSpace(32); // Style2: Different spacing
  const nameText = profile.name || 'Your Name';
  let nameSize = 20; // Style2: Larger name
  let nameFont = notoSansBold;
  
  // Apply styling preferences to name
  if (stylePreferences) {
    if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
      const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
      if (sizeMatch) {
        nameSize = Math.max(parseInt(sizeMatch[1]) + 9, 16); // Name larger than style1
      }
    }
    if (stylePreferences.useBold !== undefined) {
      nameFont = stylePreferences.useBold ? notoSansBold : notoSans;
    }
  }
  
  const nameWidth = nameFont.widthOfTextAtSize(nameText, nameSize);
  const nameX = (width - nameWidth) / 2;
  page.drawText(nameText, { x: nameX, y, size: nameSize, font: nameFont, color: getAccentColor() });
  y -= nameSize + 8; // Style2: More space after name
  
  const preferredEmail = (profile as { workEmail?: string; email?: string }).workEmail?.trim()
    ? (profile as { workEmail?: string }).workEmail
    : profile.email;
  
  // Style2: Contact info in two lines with different layout
  const contactLine1 = [preferredEmail, profile.phone].filter(Boolean).join(' • ');
  const contactLine2 = [profile.website, profile.linkedin].filter(Boolean).join(' • ');
  
  let contactSize = 10;
  
  // Apply styling preferences to contact
  if (stylePreferences && stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
    const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
    if (sizeMatch) {
      contactSize = Math.max(parseInt(sizeMatch[1]) - 1, 8);
    }
  }
  
  // Draw first contact line
  if (contactLine1) {
    const contactLine1Lines = wrapTextLines(contactLine1, notoSans, contactSize, contentWidth);
    for (const line of contactLine1Lines) {
      const contact1Width = notoSans.widthOfTextAtSize(line, contactSize);
      const contact1X = (width - contact1Width) / 2;
      page.drawText(line, { x: contact1X, y, size: contactSize, font: notoSans });
      y -= contactSize + 4;
    }
  }
  
  // Draw second contact line
  if (contactLine2) {
    const contactLine2Lines = wrapTextLines(contactLine2, notoSans, contactSize, contentWidth);
    for (const line of contactLine2Lines) {
      const contact2Width = notoSans.widthOfTextAtSize(line, contactSize);
      const contact2X = (width - contact2Width) / 2;
      page.drawText(line, { x: contact2X, y, size: contactSize, font: notoSans });
      y -= contactSize + 4;
    }
    y -= contactSize + 12; // Style2: More space after contact
  } else {
    y -= 12; // Style2: Adjust spacing if no second line
  }

  // Education section - moved to top for Style2
  if (profile.school || profile.major) {
    drawSection('Education');
    const school = profile.school || 'No school specified';
    const major = profile.major || 'No major specified';
    const studyPeriod = (profile as { studyPeriod?: string }).studyPeriod;
    
    drawHeaderRow(school, studyPeriod || '', fontSize, fontSize, getAccentColor());
    y -= 2;
    drawWrappedTextBlock(major, fontSize - 1, false);
    y -= 8;
  }

  const skillsSize = Math.max(fontSize - 2, 8);
  const profileText = formatResumeProfileParagraph(resolveResumeProfileText(profile.profileSummary));
  // Motivation vs Logic:
  // Motivation: Style2 now needs to support an optional Profile narrative before Skills without printing empty section
  // headers when the user leaves either field blank.
  // Logic: Reuse the same compact justified paragraph sizing for both sections and render each heading only when its
  // normalized content exists.
  if (profileText) {
    drawSection('Profile');
    drawJustifiedParagraph(profileText, skillsSize);
  }

  // Root Cause vs Logic:
  // Root Cause: The route treated languages as a substitute skills list and then drew Languages again underneath,
  // which repeated the same entries whenever the user had languages but no explicit skill list.
  // Logic: Skills now come only from explicit skill inputs, and the dedicated Languages line remains the sole
  // place where profile.languages is rendered.
  const skillsText = resolveResumeSkillsText(enhancedSkills, skills, profile.skills);
  if (skillsText) {
    const skillsParagraph = formatResumeSkillsParagraph(skillsText);
    drawSection('Skills');
    drawJustifiedParagraph(skillsParagraph || skillsText, skillsSize);
  }
  
  // Add Languages section if user has language data
  if (profile.languages && profile.languages.trim()) {
    drawLabelValueLine('Languages', profile.languages.trim(), fontSize - 1);
  }
  
  y -= 8; // Style2: More space after skills

  // Experience section - placed before Projects to differentiate Style2
  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    drawSection('Experience');
    console.log('Drawing experiences:', selectedExperiences.length, 'experiences');
    for (const idx of selectedExperiences) {
      const ex = profile.experiences[idx];
      if (!ex) continue;
      console.log('Experience:', ex.companyName, ex.role, 'Content length:', (ex.description || ex.summary || '').length);
      
      const headerText = `${ex.companyName || ''} — ${ex.role || ''}`.trim();
      const timeInfo = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`.trim();
      drawHeaderRow(headerText, timeInfo && timeInfo !== ' - ' ? timeInfo : '', fontSize, fontSize, getAccentColor());
      
      // Use original content + enhanced summary if available
      const originalContent = (ex as { description?: string; summary?: string }).description || ex.summary || '';
      const enhancedContent = enhancedExperienceSummaries[idx];
      const targetedEnhancedContent = contentEnhancementData?.[`experience-${idx}`];
      const finalContent = targetedEnhancedContent || enhancedContent || originalContent;
      
      if (finalContent) {
        if (finalContent.includes('**') || finalContent.includes('*')) {
          drawMarkdownText(finalContent, left, fontSize - 1);
        } else {
          drawBulletBlock(finalContent);
        }
      }
      y -= 8; // Style2: More space between experiences
    }
  }

  // Projects section with different spacing - appears after Experience in Style2
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawSection('Projects');
    console.log('Drawing projects:', selectedProjects.length, 'projects');
    for (const idx of selectedProjects) {
      const p = profile.projects[idx];
      if (!p) continue;
      console.log('Project:', p.name, 'Content length:', (p.description || p.summary || '').length);
      
      // Style2: Project name with different styling
      drawWrappedTextBlock(p.name || 'Untitled Project', fontSize, useBold, getAccentColor());
      y -= 4; // Style2: Less space after project name
      
      // Use original content + enhanced summary if available
      const originalContent = (p as { description?: string; summary?: string }).description || p.summary || '';
      const enhancedContent = enhancedProjectSummaries[idx];
      const targetedEnhancedContent = contentEnhancementData?.[`project-${idx}`];
      const finalContent = targetedEnhancedContent || enhancedContent || originalContent;
      
      if (finalContent) {
        if (finalContent.includes('**') || finalContent.includes('*')) {
          drawMarkdownText(finalContent, left, fontSize - 1);
        } else {
          drawBulletBlock(finalContent);
        }
      } else {
        console.warn('No content for project:', p.name);
      }
      y -= 8; // Style2: More space between projects
    }
  }

  // (Education already rendered at the top)

  // Validate that we have content before generating PDF
  if (y < 50) {
    console.error('PDF generation failed: insufficient content, y position too low:', y);
    return NextResponse.json({ error: 'Failed to generate PDF: insufficient content' }, { status: 500 });
  }
  
  const bytes = await pdf.save();
  
  // Validate PDF size
  if (bytes.length < 1000) {
    console.error('Generated PDF is too small:', bytes.length, 'bytes');
    return NextResponse.json({ error: 'Generated PDF is too small, please check your content' }, { status: 500 });
  }
  
  console.log('PDF generated successfully:', bytes.length, 'bytes, final y position:', y);
  
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"'
    }
  });
}
