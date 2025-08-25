import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { getModel } from '@/lib/gemini';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { skills, selectedProjects, selectedExperiences, enhance, qa } = await req.json();
  if (!Array.isArray(selectedProjects) || !Array.isArray(selectedExperiences)) {
    return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
  }
  if (selectedProjects.length + selectedExperiences.length > 7) {
    return NextResponse.json({ error: 'Too many items selected' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  type Project = { name?: string; summary?: string };
  type Experience = { companyName?: string; role?: string; summary?: string };
  type Profile = { name?: string; major?: string; school?: string; email?: string; phone?: string; website?: string; linkedin?: string; languages?: string; projects?: Project[]; experiences?: Experience[] };
  const profile = (user?.profile || {}) as Profile;

  // Optionally enhance content with Gemini for better bullet points and skills line
  let enhancedSkills: string | undefined = undefined;
  let enhancedProjectSummaries: Record<number, string> = {};
  let enhancedExperienceSummaries: Record<number, string> = {};
  if (enhance) {
    try {
      const model = getModel('gemini-2.5-flash');
      async function improve(prompt: string) {
        const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        return res.response.text().trim();
      }
      const qaNotes = Array.isArray(qa) && qa.length ? `\nContext from Q&A (user and assistant messages):\n${qa.map((m: any)=>`[${m.role}] ${m.content}`).join('\n')}` : '';
      if (skills) {
        enhancedSkills = await improve(`Rewrite these skills as a concise comma-separated list, removing redundancy and keeping professional tone.${qaNotes}\nSkills:\n${skills}`);
      }
      if (Array.isArray(profile.projects)) {
        for (const idx of selectedProjects) {
          const p = profile.projects[idx];
          if (!p) continue;
          const base = p.summary || '';
          enhancedProjectSummaries[idx] = await improve(`Improve these resume bullet points for a project in crisp, high-impact bullets (2-3 bullets max). Keep content precise, factual, and ATS-friendly. Return only bullets separated by newlines.${qaNotes}\nProject name: ${p.name||''}\nBullets/summary to improve:\n${base}`);
        }
      }
      if (Array.isArray(profile.experiences)) {
        for (const idx of selectedExperiences) {
          const ex = profile.experiences[idx];
          if (!ex) continue;
          const base = ex.summary || '';
          enhancedExperienceSummaries[idx] = await improve(`Improve these resume bullet points for a work experience in crisp, high-impact bullets (2-3 bullets max). Use quantified achievements when possible. Return only bullets separated by newlines.${qaNotes}\nCompany: ${ex.companyName||''}\nRole: ${ex.role||''}\nBullets/summary to improve:\n${base}`);
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

  function drawText(text: string, x: number, size = 11, bold = false) {
    ensureSpace(size + 8);
    page.drawText(text, { x, y, size, font: bold ? helvBold : helv, color: rgb(0, 0, 0) });
    y -= size + 6;
  }

  function drawSection(title: string) {
    ensureSpace(36);
    y -= 8;
    page.drawText(title.toUpperCase(), { x: left, y, size: 12, font: helvBold });
    y -= 14;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
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
    const size = 10;
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
      for (const line of lines) {
        const stripped = line.replace(/^[•\-\*\u2013\u2014]\s*/, '');
        drawOneBullet(stripped);
      }
    } else {
      drawOneBullet(text || '');
    }
  }

  // Header (Harvard-ish simple style)
  // Centered name
  ensureSpace(28);
  const nameText = profile.name || 'Your Name';
  const nameSize = 18;
  const nameWidth = helvBold.widthOfTextAtSize(nameText, nameSize);
  const nameX = (width - nameWidth) / 2;
  page.drawText(nameText, { x: nameX, y, size: nameSize, font: helvBold });
  y -= 22;
  // Single-line centered contact; shrink font to fit one line
  const contactFull = [profile.email, profile.phone, profile.website, profile.linkedin].filter(Boolean).join(' • ');
  let contactSize = 10;
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
  drawText(`${profile.school || ''}`, left, 11, true);
  drawText(`${profile.major || ''}`, left, 10, false);

  // Skills
  drawSection('Skills');
  drawText((enhancedSkills || skills || '').trim() || (profile.languages || ''), left, 10, false);

  // Projects
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawSection('Projects');
    for (const idx of selectedProjects) {
      const p = profile.projects[idx];
      if (!p) continue;
      drawText(p.name || 'Untitled Project', left, 11, true);
      const s = enhancedProjectSummaries[idx] || p.summary;
      if (s) drawBulletBlock(s);
      y -= 4;
    }
  }

  // Experience
  if (Array.isArray(profile.experiences) && selectedExperiences.length) {
    drawSection('Experience');
    for (const idx of selectedExperiences) {
      const ex = profile.experiences[idx];
      if (!ex) continue;
      drawText(`${ex.companyName || ''} — ${ex.role || ''}`.trim(), left, 11, true);
      const s = enhancedExperienceSummaries[idx] || ex.summary;
      if (s) drawBulletBlock(s);
      y -= 4;
    }
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"'
    }
  });
}


