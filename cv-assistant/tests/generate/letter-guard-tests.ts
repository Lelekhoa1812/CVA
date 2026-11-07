// Offline checks for the Auto Apply letter guards (pure functions, no model calls).
// Run: node -r tsconfig-paths/register -r sucrase/register/ts tests/generate/letter-guard-tests.ts
// The two "Run 1" checks reproduce the 2026-11-07 eval failures and fail until the repair in
// src/lib/cover-letter-service.ts is changed (see the proposed diff). The other checks must keep passing.
import { findLetterDefects, repairLetterStructure } from '../../src/lib/cover-letter-service';

const NAME = 'Alex Tester';
const CLOSE = 'I would welcome the opportunity to discuss how my experience fits the role.';
const northwind = { company: 'Northwind Labs', title: 'AI Engineer' };
const contoso = { company: 'Contoso Cloud', title: 'Senior Machine Learning Engineer' };
const thirdPerson = (defects: string[]) => defects.some((defect) => /third person/.test(defect));
const signOff = (defects: string[]) => defects.some((defect) => /sign-off/.test(defect));

const cases: Array<[string, () => void]> = [
  ['detector flags the applicant name used in a body sentence', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the ${northwind.title} role at ${northwind.company}. Alex Tester designed and built a Python service.\n\n${CLOSE}\n\nAlex Tester\nalex@example.com`;
    if (!thirdPerson(findLetterDefects(letter, NAME, northwind.company, northwind.title))) throw new Error('third-person defect not detected');
  }],
  ['repair rewrites a body sentence that starts with the applicant name (Run 1 Northwind)', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the ${northwind.title} role at ${northwind.company}. Alex Tester designed and built a Python service.\n\n${CLOSE}\n\nAlex Tester\nalex@example.com`;
    const fixed = repairLetterStructure(letter, NAME, northwind.company, northwind.title);
    if (thirdPerson(findLetterDefects(fixed, NAME, northwind.company, northwind.title))) throw new Error('third-person defect survives repair');
  }],
  ['repair moves a name block that sits above the closing sentence (Run 1 Contoso)', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the ${contoso.title} role at ${contoso.company}. I built a Python service that routes support tickets.\n\nAlex Tester  \nalex@example.com\n\n${CLOSE}`;
    const fixed = repairLetterStructure(letter, NAME, contoso.company, contoso.title);
    if (signOff(findLetterDefects(fixed, NAME, contoso.company, contoso.title))) throw new Error('sign-off defect survives repair');
  }],
  ['a normal sign-off passes unchanged', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the ${contoso.title} role at ${contoso.company}. I built a Python service that routes support tickets.\n\n${CLOSE}\n\nSincerely,\nAlex Tester`;
    const fixed = repairLetterStructure(letter, NAME, contoso.company, contoso.title);
    if (signOff(findLetterDefects(fixed, NAME, contoso.company, contoso.title))) throw new Error('normal sign-off flagged');
  }],
  ['a name on the sign-off line is not treated as third person', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the ${contoso.title} role at ${contoso.company}. I built a Python service that routes support tickets.\n\n${CLOSE}\n\nSincerely,\nAlex Tester`;
    if (thirdPerson(findLetterDefects(letter, NAME, contoso.company, contoso.title))) throw new Error('sign-off name flagged as third person');
  }],
  ['an unlisted third-person form stays flagged after repair (no unsafe rewrite)', () => {
    const letter = `Dear Hiring Manager,\n\nI am applying for the role at ${contoso.company}. Alex Tester's Python service routes support tickets.\n\n${CLOSE}\n\nAlex Tester\nalex@example.com`;
    const fixed = repairLetterStructure(letter, NAME, contoso.company, contoso.title);
    if (!thirdPerson(findLetterDefects(fixed, NAME, contoso.company, contoso.title))) throw new Error('unexpected rewrite of possessive form');
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}
console.log(failed ? `${failed} of ${cases.length} letter guard checks failed` : `Letter guard tests passed (${cases.length})`);
process.exitCode = failed ? 1 : 0;
