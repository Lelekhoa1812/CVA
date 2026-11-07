# Auto Apply: strict quality metrics

Measured by running the real app (localhost:3100) as the test user with real NVIDIA NIM calls. Unit tests do not count toward these.

| # | Metric | Target |
|---|--------|--------|
| 1 | Discovery precision: share of top-10 roles that match the target title and location | >= 80% |
| 2 | Duplicate or dead listings in a shortlist | 0 |
| 3 | Employer form read (real fields, not a stub) for ATS-backed roles | >= 90% |
| 4 | Required non-sensitive questions answered without user input | >= 90% |
| 5 | Sensitive answers (work rights, sponsorship, salary, EEO) taken from preferences or memory, never invented | 100% |
| 6 | Multiple-choice answers that are a valid option of that field | 100% |
| 7 | Cover letter: well-formed, 170-400 words, names the company and role, no claim absent from the CV | 100% |
| 8 | Cover letter standard path latency (includes the grounding edit pass) | p95 <= 60 s |
| 9 | Prepare latency per application | p95 <= 120 s |
| 10 | Run completes or recovers from a model timeout without a stuck session | 100% |
| 11 | Submissions made without the user pressing Submit | 0 |
| 12 | UI: no console errors, no horizontal scroll at 375 px, every control has an accessible name | 0 violations |

Gaps found against these go in the audit reports; each fix is retested on the real app.

## Measured on the real app (lelekhoa1812, live NVIDIA NIM)

Final-state run of all 10 prepared jobs after the last code change (stronger grounding editor):

- Structure: 10 of 10 are 224-338 words, name the exact role and company in the opening, have paragraphs, no fragments, no contact details in the body, and end with the applicant's name (8 of 10 also end on an explicit closing sentence; the other 2 end on a body paragraph).
- Grounding: letters are built from real CV entries; no invented degrees, years, tools, employers or project-as-employer claims flagged. Earlier hand reads found small residual wording slips (a typo, generic mentoring phrasing); the final run was checked by the automated rules plus the closing/tail read, not a full re-read of all 10.
- Claim check: the model-based check flagged 4 of 10 letters (warn only, by user decision).
- Latency of the letter step: 33-106 s, median about 46 s (target p95 <= 60 s is not met by design: stronger editor chosen by the user). A batch of 10 can need a second "Start".
- Promptfoo (`npm run eval:letters`): passes, including a hostile job description.
- Letters remain drafts for the applicant to review.
