import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';

// Motivation vs Logic:
// Motivation: pdf-lib StandardFonts encode through WinAnsi and throw on common Unicode (e.g. Vietnamese).
// Logic: Register fontkit once per document, embed bundled Noto Sans TTFs, and reuse from all resume routes.

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

const NOTO_SANS_REGULAR = fs.readFileSync(path.join(FONTS_DIR, 'NotoSans-Regular.ttf'));
const NOTO_SANS_BOLD = fs.readFileSync(path.join(FONTS_DIR, 'NotoSans-Bold.ttf'));

export async function embedNotoSansFonts(pdf: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([pdf.embedFont(NOTO_SANS_REGULAR), pdf.embedFont(NOTO_SANS_BOLD)]);
  return { regular, bold };
}
