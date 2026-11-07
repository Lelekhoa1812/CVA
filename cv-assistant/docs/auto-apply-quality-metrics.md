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

Final-state run of all 10 prepared jobs (stronger grounding editor), every letter read in full:

- Structure: 10 of 10 are 196-286 words, open by naming the exact role and company, have paragraphs and a sign-off, and contain no fragments. A duplicated sign-off seen once (contact line before "Sincerely") is fixed in code after that run.
- Grounding: every letter is built from real CV entries (employers, projects, figures); no invented degrees, years, tools or employers found. Small residual issues seen: one typo ("determinist"), generic coaching/mentoring phrasing in one Xero letter, one letter ending on a contact line instead of a closing sentence.
- Claim check: the model-based check flagged 1 of 10 letters.
- Latency of the letter step: 24-120 s, median about 45 s. The 60 s target is not met by design (stronger editor chosen by the user); slow letters can make a batch of 10 need a second "Start".
- Promptfoo (`npm run eval:letters`): passes, including a hostile job description.
- Letters remain drafts for the applicant to review.
