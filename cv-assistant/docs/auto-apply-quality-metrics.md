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

- Letters (10 jobs, last full run): 196-252 words, all with greeting, company, role and sign-off; no term, year, degree, figure or employer claim flagged by the guards; call time 14-59 s.
- Hand-read: letters were read in full twice. The first read found requirements echoed as experience (on-call, security, Go, serverless); the grounding pass (an editor given the whole CV) removed most of them. Wording slips (such as "In that role") and occasional JD echoes can still occur, so letters stay drafts to review.
- Promptfoo (`npm run eval:letters`): 3/3 cases pass, including a hostile job description.
