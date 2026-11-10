// Seniority-aware fit: a deterministic level read from job and role titles, so a Director role is not carried by a score that
// only the model judged. A title with no level word is not guessed at, and a gap of one level (Senior for a Mid candidate)
// is normal, so only a clear mismatch costs points.

export const LEVELS = { intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, director: 5, executive: 6 } as const;
export type LevelName = keyof typeof LEVELS;

const LEVEL_WORDS: Array<{ level: LevelName; pattern: RegExp }> = [
  { level: "intern", pattern: /\b(intern|internship|trainee|graduate|grad program(?:me)?)\b/i },
  { level: "junior", pattern: /\b(junior|jr\.?|entry[- ]level|associate)\b/i },
  { level: "senior", pattern: /\b(senior|sr\.?)\b/i },
  { level: "lead", pattern: /\b(lead|staff|principal|architect|manager|team lead|head of product)\b/i },
  { level: "director", pattern: /\b(director|head of|group manager)\b/i },
  { level: "executive", pattern: /\b(vice president|vp|chief|cto|cio|cfo|coo|ceo|cpo|general manager)\b/i },
];

/** The highest level a title names, or null when it names none. */
export function levelOf(title: string): LevelName | null {
  let best: LevelName | null = null;
  for (const { level, pattern } of LEVEL_WORDS) {
    if (pattern.test(title) && (!best || LEVELS[level] > LEVELS[best])) best = level;
  }
  return best;
}

/** The candidate's level from their experience titles: the highest one named. Null when no title says anything. */
export function candidateLevel(roles: Array<string | undefined | null>): LevelName | null {
  let best: LevelName | null = null;
  for (const role of roles) {
    const level = levelOf(String(role || ""));
    if (level && (!best || LEVELS[level] > LEVELS[best])) best = level;
  }
  return best;
}

/**
 * Points taken off a fit score for a clear seniority mismatch. One level either way costs nothing. Two or more levels above
 * the candidate costs 15, plus 5 for each further level. Two or more below costs 10, plus 5 for each further level.
 */
export function seniorityPenalty(jobTitle: string, candidate: LevelName | null): { penalty: number; note: string } {
  const job = levelOf(jobTitle);
  if (!job || !candidate) return { penalty: 0, note: "" };
  const gap = LEVELS[job] - LEVELS[candidate];
  if (gap >= 2) {
    const penalty = Math.min(30, 15 + 5 * (gap - 2));
    return { penalty, note: `Seniority: the role is ${job} level, above your ${candidate} experience` };
  }
  if (gap <= -2) {
    const penalty = Math.min(25, 10 + 5 * (-gap - 2));
    return { penalty, note: `Seniority: the role is ${job} level, below your ${candidate} experience` };
  }
  return { penalty: 0, note: "" };
}
