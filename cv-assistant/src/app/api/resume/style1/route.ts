import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';
import { PDFDocument, StandardFonts, rgb, type RGB } from 'pdf-lib';

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
  if (selectedProjects.length + selectedExperiences.length > 7) {
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
  type Profile = { name?: string; major?: string; school?: string; email?: string; phone?: string; website?: string; linkedin?: string; languages?: string; projects?: Project[]; experiences?: Experience[] };
  const profile = (user?.profile || {}) as Profile;

  // Parse style preferences and enhance content if requested
  let enhancedSkills: string | undefined = undefined;
  const enhancedProjectSummaries: Record<number, string> = {};
  const enhancedExperienceSummaries: Record<number, string> = {};
  let fontSize = 11;
  let useBold = false;
  let useItalic = false;
  let contentDensity = 'balanced';
  
  // Always parse style preferences if available, regardless of enhance flag
  if (stylePreferences) {
    fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
    useBold = stylePreferences.useBold || false;
    useItalic = stylePreferences.useItalic || false;
    contentDensity = stylePreferences.contentDensity || 'balanced';
  }
  
  if (enhance && stylePreferences) {
    try {
      // Parse style preferences
      fontSize = stylePreferences.fontSize === '10pt' ? 10 : stylePreferences.fontSize === '12pt' ? 12 : 11;
      useBold = stylePreferences.useBold || false;
      useItalic = stylePreferences.useItalic || false;
      contentDensity = stylePreferences.contentDensity || 'balanced';
      
      // Enhance content with Gemini
      const model = getModel('gemini-2.5-flash');
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
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 72; // 1 inch on all sides
  const left = margin;
  const right = width - margin;
  const bottom = margin;
  const top = height - margin;
  let y = top;

  function newPage() {
    page = pdf.addPage([612, 792]);
    ({ width, height } = page.getSize());
    y = height - margin;
  }

  function ensureSpace(required: number) {
    if (y - required < bottom) newPage();
  }

  function getAccentColor(): RGB {
    const color = stylePreferences?.accentColor || 'black';
    if (color === 'dark-blue') return rgb(0.1, 0.2, 0.5);
    if (color === 'dark-gray') return rgb(0.2, 0.2, 0.2);
    return rgb(0, 0, 0);
  }

  function drawText(text: string, x: number, size = 11, bold = false, colorOverride?: RGB) {
    if (!text || !text.trim()) return;
    ensureSpace(size + 8);
    
    // Apply styling preferences
    let finalSize = size;
    let finalBold = bold;
    
    if (stylePreferences) {
      // Apply font size preference if specified
      if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
        const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
        if (sizeMatch) {
          finalSize = parseInt(sizeMatch[1]);
        }
      }
      
      // Apply bold preference if specified
      if (stylePreferences.useBold !== undefined) {
        finalBold = stylePreferences.useBold && bold; // Only bold if both user wants bold AND function parameter is true
      }
    }
    
    const font = finalBold ? helvBold : helv;
    const color: RGB = colorOverride || rgb(0, 0, 0);
    page.drawText(text, { x, y, size: finalSize, font, color });
    y -= finalSize + 6;
  }

  function drawMarkdownText(text: string, x: number, size = 11) {
    // Apply styling preferences
    let finalSize = size;
    let allowBold = true;
    let allowItalic = true;
    if (stylePreferences) {
      if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
        const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
        if (sizeMatch) finalSize = parseInt(sizeMatch[1]);
      }
      if (stylePreferences.useBold !== undefined) allowBold = stylePreferences.useBold;
      if (stylePreferences.useItalic !== undefined) allowItalic = stylePreferences.useItalic;
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
      const spaceCache = { helv: new Map<number, number>(), helvBold: new Map<number, number>() };
      const widthOf = (t: Token) => (t.bold ? helvBold : helv).widthOfTextAtSize(t.text, finalSize);
      const isSpace = (t: Token) => /^\s+$/.test(t.text);

      const flushLine = (justify: boolean) => {
        if (line.length === 0) return;
        ensureSpace(finalSize + 4);
        if (!justify) {
          // Left draw
          let cx = x;
          for (const tk of line) {
            const f = tk.bold ? helvBold : helv;
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
            const f = tk.bold ? helvBold : helv;
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
    ensureSpace(36);
    y -= 8;
    
    // Apply styling preferences to section titles
    let titleSize = 12;
    let useBold = true;
    
    if (stylePreferences) {
      if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
        const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
        if (sizeMatch) {
          titleSize = Math.max(parseInt(sizeMatch[1]) + 1, 10); // Section titles slightly larger
        }
      }
      if (stylePreferences.useBold !== undefined) {
        useBold = stylePreferences.useBold;
      }
    }
    
    const font = useBold ? helvBold : helv;
    page.drawText(title.toUpperCase(), { x: left, y, size: titleSize, font, color: getAccentColor() });
    y -= titleSize + 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: getAccentColor() });
    y -= 10;
  }

  function drawJustifiedLine(words: string[], x: number, size: number, justify: boolean) {
    const maxWidth = right - left;
    const spaceWidth = helv.widthOfTextAtSize(' ', size);
    const textWidth = helv.widthOfTextAtSize(words.join(' '), size);
    if (!justify || words.length <= 1 || textWidth >= maxWidth) {
      page.drawText(words.join(' '), { x, y, size, font: helv });
      return;
    }
    const extra = (maxWidth - textWidth) / (words.length - 1);
    let cursor = x;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      page.drawText(w, { x: cursor, y, size, font: helv });
      if (i < words.length - 1) {
        cursor += helv.widthOfTextAtSize(w, size) + spaceWidth + extra;
      }
    }
  }

  function drawWrappedText(text: string, size = 10) {
    const words = (text || '').split(/\s+/);
    const maxWidth = right - left;
    let line = '';
    ensureSpace(size + 4);
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (helv.widthOfTextAtSize(next, size) > maxWidth) {
        drawJustifiedLine(line.split(' '), left, size, true);
        y -= size + 4;
        ensureSpace(size + 4);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) {
      // Last line not justified
      page.drawText(line, { x: left, y, size, font: helv });
      y -= size + 4;
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
    
    const bulletChar = '•';
    const bulletIndent = helv.widthOfTextAtSize(bulletChar + '  ', size);
    const maxWidth = right - left - bulletIndent;

    function drawOneBullet(content: string) {
      const words = (content || '').split(/\s+/).filter(Boolean);
      if (words.length === 0) return;
      ensureSpace(size + 4);
      // Draw bullet marker
      page.drawText(bulletChar, { x: left, y, size, font: helv });
      let lineWords: string[] = [];
      let lineWidth = 0;
      const spaceWidth = helv.widthOfTextAtSize(' ', size);
      for (const w of words) {
        const wWidth = helv.widthOfTextAtSize(w, size);
        const nextWidth = lineWords.length === 0 ? wWidth : lineWidth + spaceWidth + wWidth;
        if (nextWidth > maxWidth) {
          // Draw justified line for bullet text
          drawJustifiedLine(lineWords, left + bulletIndent, size, true);
          y -= size + 4;
          ensureSpace(size + 4);
          page.drawText(' ', { x: left, y, size, font: helv }); // maintain flow
          lineWords = [w];
          lineWidth = wWidth;
        } else {
          lineWords.push(w);
          lineWidth = nextWidth;
        }
      }
      if (lineWords.length) {
        // Last line of bullet not justified
        page.drawText(lineWords.join(' '), { x: left + bulletIndent, y, size, font: helv });
        y -= size + 4;
      }
    }

    // Preserve multiple bullets if present
    const lines = (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const looksLikeBullets = lines.some(l => /^[•\-\*\u2013\u2014]/.test(l));
    
    if (looksLikeBullets) {
      // Process each bullet point separately to maintain line breaks
      for (const line of lines) {
        const stripped = line.replace(/^[•\-\*\u2013\u2014]\s*/, '');
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

  // Header (Harvard-ish simple style)
  // Centered name
  ensureSpace(28);
  const nameText = profile.name || 'Your Name';
  let nameSize = 18;
  let nameFont = helvBold;
  
  // Apply styling preferences to name
  if (stylePreferences) {
    if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
      const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
      if (sizeMatch) {
        nameSize = Math.max(parseInt(sizeMatch[1]) + 7, 14); // Name larger than body text
      }
    }
    if (stylePreferences.useBold !== undefined) {
      nameFont = stylePreferences.useBold ? helvBold : helv;
    }
  }
  
  const nameWidth = nameFont.widthOfTextAtSize(nameText, nameSize);
  const nameX = (width - nameWidth) / 2;
  page.drawText(nameText, { x: nameX, y, size: nameSize, font: nameFont, color: getAccentColor() });
  y -= nameSize + 4;
  
  const preferredEmail = (profile as { workEmail?: string; email?: string }).workEmail?.trim()
    ? (profile as { workEmail?: string }).workEmail
    : profile.email;
  // Single-line centered contact; shrink font to fit one line
  const contactFull = [preferredEmail, profile.phone, profile.website, profile.linkedin].filter(Boolean).join(' • ');
  let contactSize = 10;
  
  // Apply styling preferences to contact
  if (stylePreferences && stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
    const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
    if (sizeMatch) {
      contactSize = Math.max(parseInt(sizeMatch[1]) - 1, 8); // Contact slightly smaller than body
    }
  }
  
  const maxContactWidth = right - left;
  let contactWidth = helv.widthOfTextAtSize(contactFull, contactSize);
  while (contactWidth > maxContactWidth && contactSize > 7) {
    contactSize -= 0.5;
    contactWidth = helv.widthOfTextAtSize(contactFull, contactSize);
  }
  const contactX = (width - contactWidth) / 2;
  page.drawText(contactFull, { x: contactX, y, size: contactSize, font: helv });
  y -= contactSize + 10;

  // Education
  drawSection('Education');
  const school = profile.school || 'No school specified';
  const major = profile.major || 'No major specified';
  // Draw school and study period on one line (school left, period right)
  const studyPeriod = (profile as { studyPeriod?: string }).studyPeriod;
  if (studyPeriod && studyPeriod.trim()) {
    // Draw school (left)
    drawText(school, left, fontSize, useBold);
    // Draw study period (right, aligned to right margin on the same baseline)
    const periodFont = useBold ? helvBold : helv;
    const periodWidth = periodFont.widthOfTextAtSize(studyPeriod, fontSize);
    const periodX = right - periodWidth;
    page.drawText(studyPeriod, { x: periodX, y: y + fontSize + 6, size: fontSize, font: periodFont });
  } else {
    drawText(school, left, fontSize, useBold);
  }
  drawText(major, left, fontSize - 1, false);

  // Contact emails under education: prefer workEmail if present
  // const preferredEmail = (profile as any).workEmail?.trim() ? (profile as any).workEmail : profile.email;
  // if (preferredEmail) {
  //   drawText(preferredEmail, left, fontSize - 1, false);
  // }

  // Skills
  drawSection('Skills');
  let skillsText = (enhancedSkills || skills || '').trim() || (profile.languages || '');
  
  // Fallback if no skills provided
  if (!skillsText) {
    skillsText = 'No skills specified';
  }
  
  // Handle skills with proper wrapping to prevent overlap
  if (skillsText.includes('**') || skillsText.includes('*')) {
    drawMarkdownText(skillsText, left, fontSize - 1);
  } else {
    // Preserve original line breaks from user input, but wrap long lines
    const skillLines = skillsText.split('\n').filter((line: string) => line.trim());
    for (const line of skillLines) {
      if (line.trim()) {
        // Check if line exceeds margin width
        const lineWidth = helv.widthOfTextAtSize(line.trim(), fontSize - 1);
        const maxWidth = right - left;
        
        if (lineWidth > maxWidth) {
          // Line is too long, use word wrapping
          drawWrappedText(line.trim(), fontSize - 1);
        } else {
          // Line fits, draw normally
          drawText(line.trim(), left, fontSize - 1, false);
        }
      }
    }
  }
  
  // Add Languages section if user has language data
  if (profile.languages && profile.languages.trim()) {
    const languagesText = `Language: ${profile.languages.trim()}`;
    // Draw "Language:" in bold, then the languages in regular font
    const labelPart = 'Language: ';
    const languagesPart = profile.languages.trim();
    
    // Calculate positions for proper alignment
    const labelWidth = helvBold.widthOfTextAtSize(labelPart, fontSize - 1);
    
    // Draw "Language:" label in bold
    page.drawText(labelPart, { x: left, y, size: fontSize - 1, font: helvBold });
    // Draw languages in regular font
    page.drawText(languagesPart, { x: left + labelWidth, y, size: fontSize - 1, font: helv });
    y -= fontSize - 1 + 6; // Adjust y position for next section
  }

  // Projects
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawSection('Projects');
    console.log('Drawing projects:', selectedProjects.length, 'projects');
    for (const idx of selectedProjects) {
      const p = profile.projects[idx];
      if (!p) continue;
      console.log('Project:', p.name, 'Content length:', (p.description || p.summary || '').length);
      drawText(p.name || 'Untitled Project', left, fontSize, useBold, getAccentColor());
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
      y -= 4;
    }
  }

  // Experience
  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    drawSection('Experience');
    console.log('Drawing experiences:', selectedExperiences.length, 'experiences');
    for (const idx of selectedExperiences) {
      const ex = profile.experiences[idx];
      if (!ex) continue;
      console.log('Experience:', ex.companyName, ex.role, 'Content length:', (ex.description || ex.summary || '').length);
      
      // Company and role on left, dates on right
      const headerText = `${ex.companyName || ''} — ${ex.role || ''}`.trim();
      const timeInfo = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`.trim();
      
      // Calculate positions for proper alignment
      const headerWidth = helvBold.widthOfTextAtSize(headerText, fontSize);
      const timeWidth = helv.widthOfTextAtSize(timeInfo, fontSize - 1);
      const maxHeaderWidth = right - left - timeWidth - 20; // 20pt spacing
      
      // Scale header font if too long
      let headerFontSize = fontSize;
      if (headerWidth > maxHeaderWidth) {
        headerFontSize = Math.max(fontSize - 2, 8); // Don't go below 8pt
      }
      
      // Draw header (left-aligned)
      drawText(headerText, left, headerFontSize, useBold, getAccentColor());
      
      // Draw dates (right-aligned)
      if (timeInfo && timeInfo !== ' - ') {
        const timeX = right - timeWidth;
        page.drawText(timeInfo, { x: timeX, y: y + headerFontSize + 6, size: fontSize - 1, font: helv, color: rgb(0, 0, 0) });
      }
      
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
      y -= 4; // Same spacing as projects
    }
  }

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


