export function resolveResumeSkillsText(...sources: Array<string | undefined | null>) {
  for (const source of sources) {
    const normalized = (source || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}
