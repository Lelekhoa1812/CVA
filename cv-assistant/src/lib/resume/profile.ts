export function resolveResumeProfileText(...sources: Array<string | undefined | null>) {
  for (const source of sources) {
    const normalized = (source || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function formatResumeProfileParagraph(...sources: Array<string | undefined | null>) {
  // Motivation vs Logic:
  // Motivation: The new resume Profile section should render like polished narrative body copy even when the source
  // text comes from pasted notes, bullets, or lightly formatted markdown.
  // Logic: Normalize the first populated profile source into one clean paragraph with bullets/inline markdown stripped
  // so every PDF route can justify the same text without reimplementing cleanup rules.
  const resolved = resolveResumeProfileText(...sources);
  if (!resolved) return '';

  return resolved
    .replace(/^\s*[\*\-\u2013\u2014•]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
