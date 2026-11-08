/** Edit distance between two short words. */
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const HONOURS_FORMS = new Set(["hons", "honours", "honors", "honour", "honor"]);

/** A near miss: close to the right word but not the word itself. */
function looksLike(word: string, target: string, maxDistance: number) {
  const gap = distance(word, target);
  return gap > 0 && gap <= maxDistance;
}

/**
 * Spelling problems in the degree line of a profile ("Bacheler of Arts", "(Hornours)"). A letter copies this line, and the writer model repairs a garbled word differently
 * each time, so the applicant is told to fix it once at the source. Returns plain-language hints, empty when the line looks fine.
 */
export function findProfileSpellingHints(profile?: { major?: string } | null): string[] {
  const major = (profile?.major || "").replace(/\s+/g, " ").trim();
  if (!major) return [];
  const words = major.toLowerCase().match(/[a-z]+/g) || [];
  const first = words[0] || "";
  const parenthetical = (major.match(/\(([^)]*)\)/g) || []).flatMap((part) => part.toLowerCase().match(/[a-z]+/g) || []);
  const garbledDegree = !["bachelor", "master", "masters"].includes(first) && (looksLike(first, "bachelor", 2) || looksLike(first, "master", 1));
  const garbledHonours = parenthetical.some((word) => !HONOURS_FORMS.has(word) && (looksLike(word, "honours", 3) || looksLike(word, "honors", 2) || looksLike(word, "hons", 1)));
  return garbledDegree || garbledHonours
    ? [`Check the spelling of your degree, "${major}", in your profile. It looks like a typo, and a letter may spell it differently each time.`]
    : [];
}
