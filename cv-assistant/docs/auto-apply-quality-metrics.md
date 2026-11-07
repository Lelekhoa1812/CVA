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

Final-state run of all 10 prepared jobs after the last code change:

- Structure: 10 of 10 are 176-280 words with greeting, company, role, paragraphs and sign-off; no broken sentence fragments; no term, year, degree, figure, employer or project-as-employer claim flagged.
- Grounding: letters draw on real CV entries; the editor pass removed requirements stated as experience (on-call, security, Go, serverless, forward-deployed).
- Latency of the letter step: 11-56 s (target p95 <= 60 s met in this run; slower models have reached about 75 s in earlier runs).
- Promptfoo (`npm run eval:letters`): passes, including a hostile job description.
- The model-based claim check flags a minority of letters (3 of 10 here); flags only warn (decision: warn only).
- Earlier full reads by hand found echoes of job-posting wording (stakeholders, mentoring) and small garbles; letters remain drafts for the applicant to review.
