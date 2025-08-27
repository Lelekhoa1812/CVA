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
    
    const font = useBold ? helvBold : helv;
    const titleUpper = title.toUpperCase();
    const titleWidth = font.widthOfTextAtSize(titleUpper, titleSize);
    const titleX = (width - titleWidth) / 2;
    page.drawText(titleUpper, { x: titleX, y, size: titleSize, font, color: getAccentColor() });
    y -= titleSize + 8; // Style2: More space after title
    
    // Full-width underline between content margins
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.2, color: getAccentColor() });
    y -= 12; // Style2: More space after line
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
      const spaceWidth = helv.widthOfTextAtSize(' ', size);
      for (const w of words) {
        const wWidth = helv.widthOfTextAtSize(w, size);
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
        page.drawText(lineWords.join(' '), { x: left + bulletIndent, y, size, font: helv });
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
  let nameFont = helvBold;
  
  // Apply styling preferences to name
  if (stylePreferences) {
    if (stylePreferences.fontSize && stylePreferences.fontSize !== '11pt') {
      const sizeMatch = stylePreferences.fontSize.match(/(\d+)pt/);
      if (sizeMatch) {
        nameSize = Math.max(parseInt(sizeMatch[1]) + 9, 16); // Name larger than style1
      }
    }
    if (stylePreferences.useBold !== undefined) {
      nameFont = stylePreferences.useBold ? helvBold : helv;
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
    const contact1Width = helv.widthOfTextAtSize(contactLine1, contactSize);
    const contact1X = (width - contact1Width) / 2;
    page.drawText(contactLine1, { x: contact1X, y, size: contactSize, font: helv });
    y -= contactSize + 4;
  }
  
  // Draw second contact line
  if (contactLine2) {
    const contact2Width = helv.widthOfTextAtSize(contactLine2, contactSize);
    const contact2X = (width - contact2Width) / 2;
    page.drawText(contactLine2, { x: contact2X, y, size: contactSize, font: helv });
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
    
    if (studyPeriod && studyPeriod.trim()) {
      // Draw school and study period on same row
      const schoolFont = useBold ? helvBold : helv;
      const periodFont = helv;
      const periodWidth = periodFont.widthOfTextAtSize(studyPeriod, fontSize);
      const periodX = right - periodWidth;
      
      // Draw school (left)
      page.drawText(school, { x: left, y, size: fontSize, font: schoolFont });
      // Draw study period (right, same baseline)
      page.drawText(studyPeriod, { x: periodX, y, size: fontSize, font: periodFont });
      y -= fontSize + 8;
    } else {
      drawText(school, left, fontSize, useBold);
      y -= 8;
    }
    drawText(major, left, fontSize - 1, false);
    y -= 8;
  }

  // Skills section - follows Education in Style2
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
    // Use drawWrappedText for skills to ensure proper wrapping
    drawWrappedText(skillsText, fontSize - 1);
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
      
      // Style2: Company/role and dates on same row with different spacing
      const headerText = `${ex.companyName || ''} — ${ex.role || ''}`.trim();
      const timeInfo = `${ex.timeFrom || ''} - ${ex.timeTo || ''}`.trim();
      
      // Draw company/role and dates on same row
      const headerFont = useBold ? helvBold : helv;
      const timeWidth = helv.widthOfTextAtSize(timeInfo, fontSize);
      const timeX = right - timeWidth;
      
      // Draw header (left-aligned)
      page.drawText(headerText, { x: left, y, size: fontSize, font: headerFont, color: getAccentColor() });
      // Draw dates (right-aligned, same baseline)
      if (timeInfo && timeInfo !== ' - ') {
        page.drawText(timeInfo, { x: timeX, y, size: fontSize, font: helv, color: rgb(0, 0, 0) });
      }
      
      y -= fontSize + 6; // Style2: Less space after experience header
      
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
      drawText(p.name || 'Untitled Project', left, fontSize, useBold, getAccentColor());
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
