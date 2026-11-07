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

Final-state run of all 10 prepared jobs, every letter read in full against the CV:

- Structure: 9 of 10 are 197-266 words with greeting, company, role, paragraphs and sign-off; one (Xero ML & AI Systems) is 143 words.
- Grounding: letters now draw on real CV entries (employers, projects, figures). Earlier reads found job requirements stated as experience (on-call, security, Go, serverless, forward-deployed); the grounding editor pass and term checks removed those. Remaining slips seen: one garbled figure ("boosted diagnostic accuracy by 500k+ curated cases"), one typo ("HPa"), generic closings, and occasional echoes of job-posting wording such as stakeholder or success-criteria phrasing.
- Latency of the letter step: 14-75 s (target p95 <= 60 s is not met on slow models).
- Promptfoo (`npm run eval:letters`): 3/3 cases pass, including a hostile job description.
- The model-based claim check flags about half of letters; flags only warn (decision: warn only).

Letters remain drafts for the applicant to review.
