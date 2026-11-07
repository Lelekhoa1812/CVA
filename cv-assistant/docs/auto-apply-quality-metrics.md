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

Final-state run of all 10 prepared jobs, with the stronger grounding editor (nemotron-3-ultra, user decision):

- Structure: 10 of 10 are 193-283 words with greeting, paragraphs and sign-off; one letter (Artificial Analysis) never names the exact role title; no broken fragments; no term, year, degree, figure, employer or project-as-employer claim flagged.
- Claim check: the model-based check flagged 1 of 10 (3-5 of 10 with the fast editor), so the stronger editor invents or echoes less.
- Latency of the letter step: 33-126 s, median about 57 s (the fast editor was 11-56 s). The 60 s target is not met by design; a batch of 10 can need a second "Start" press to finish.
- Promptfoo (`npm run eval:letters`): passes, including a hostile job description.
- Letters remain drafts for the applicant to review.
