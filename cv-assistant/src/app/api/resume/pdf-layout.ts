type MeasuredFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

function splitLongToken(token: string, font: MeasuredFont, size: number, maxWidth: number): string[] {
  if (!token) return [];
  if (font.widthOfTextAtSize(token, size) <= maxWidth) return [token];

  const chunks: string[] = [];
  let current = '';

  for (const char of token) {
    const next = current + char;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function stripMarkdownForPdf(text: string): string {
  return (text || '')
    .replace(/^\s*[\*\-\u2013\u2014•]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function splitResumeItems(text: string): string[] {
  return stripMarkdownForPdf(text)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function wrapTextLines(text: string, font: MeasuredFont, size: number, maxWidth: number): string[] {
  const paragraphs = (text || '')
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      const segments = splitLongToken(word, font, size, maxWidth);
      for (const segment of segments) {
        const next = current ? `${current} ${segment}` : segment;
        if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
          lines.push(current);
          current = segment;
        } else {
          current = next;
        }
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

export function packItemsIntoLines(
  items: string[],
  font: MeasuredFont,
  size: number,
  maxWidth: number,
  separator = ', '
): string[] {
  const lines: string[] = [];
  let current = '';

  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) continue;

    const wrappedItem = wrapTextLines(item, font, size, maxWidth);
    if (wrappedItem.length > 1) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...wrappedItem);
      continue;
    }

    const candidate = current ? `${current}${separator}${wrappedItem[0]}` : wrappedItem[0];
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = wrappedItem[0];
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function measureLineBlock(lines: string[], lineHeight: number): number {
  return lines.length * lineHeight;
}
