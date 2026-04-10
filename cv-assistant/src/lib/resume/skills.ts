export function resolveResumeSkillsText(...sources: Array<string | undefined | null>) {
  for (const source of sources) {
    const normalized = (source || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function formatResumeSkillsParagraph(...sources: Array<string | undefined | null>) {
  // Motivation vs Logic:
  // Motivation: Resume PDFs now need the skills section to read like body copy instead of a loose list, but each
  // template still resolves its data from the same profile/request sources.
  // Logic: Normalize the first populated skills source into one comma-separated paragraph with inline markdown
  // stripped so every PDF route can render smaller, justified skills text without duplicating cleanup rules.
  const resolved = resolveResumeSkillsText(...sources);
  if (!resolved) return '';

  const plainText = resolved
    .replace(/^\s*[\*\-\u2013\u2014•]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

  const items = plainText
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items.join(', ') : plainText.replace(/\s+/g, ' ').trim();
}
