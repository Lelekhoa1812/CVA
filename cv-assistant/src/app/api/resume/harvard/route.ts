import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromCookies } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/User';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { skills, selectedProjects, selectedExperiences } = await req.json();
  if (!Array.isArray(selectedProjects) || !Array.isArray(selectedExperiences)) {
    return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
  }
  if (selectedProjects.length + selectedExperiences.length > 10) {
    return NextResponse.json({ error: 'Too many items selected' }, { status: 400 });
  }

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile || {};

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Letter size points
  const { width } = page.getSize();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 760;
  const left = 72; // 1 inch margin

  function drawText(text: string, x: number, size = 11, bold = false) {
    page.drawText(text, { x, y, size, font: bold ? helvBold : helv, color: rgb(0, 0, 0) });
    y -= size + 6;
  }

  function drawSection(title: string) {
    y -= 8;
    page.drawText(title.toUpperCase(), { x: left, y, size: 12, font: helvBold });
    y -= 14;
    page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
    y -= 10;
  }

  function drawBullet(text: string) {
    const bullet = '• ';
    const words = (text || '').split(/\s+/);
    const maxWidth = width - left * 2;
    let line = bullet;
    const size = 10;
    const font = helv;
    const spaceWidth = font.widthOfTextAtSize(' ', size);
    for (const w of words) {
      const newLine = line + (line === bullet ? '' : ' ') + w;
      if (font.widthOfTextAtSize(newLine, size) > maxWidth) {
        page.drawText(line, { x: left, y, size, font });
        y -= size + 4;
        line = '  ' + w;
      } else {
        line = newLine;
      }
    }
    if (line.trim()) {
      page.drawText(line, { x: left, y, size, font });
      y -= size + 4;
    }
  }

  // Header (Harvard-ish simple style)
  page.drawText(profile.name || 'Your Name', { x: left, y, size: 18, font: helvBold });
  y -= 20;
  const contact = [profile.email, profile.phone, profile.website, profile.linkedin].filter(Boolean).join(' • ');
  page.drawText(contact, { x: left, y, size: 10, font: helv });
  y -= 18;

  // Education
  drawSection('Education');
  drawText(`${profile.school || ''}`, left, 11, true);
  drawText(`${profile.major || ''}`, left, 10, false);

  // Skills
  drawSection('Skills');
  drawText((skills || '').trim() || (profile.languages || ''), left, 10, false);

  // Projects
  if (Array.isArray(profile.projects) && selectedProjects.length) {
    drawSection('Projects');
    for (const idx of selectedProjects) {
      const p = profile.projects[idx];
      if (!p) continue;
      drawText(p.name || 'Untitled Project', left, 11, true);
      if (p.summary) drawBullet(p.summary);
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
      if (ex.summary) drawBullet(ex.summary);
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


