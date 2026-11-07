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

Last full live run of all 10 prepared jobs (after the guards commit, before the greeting fix):

- Structure: 10 of 10 are 233-317 words, open naming the role and company, have paragraphs and a sign-off. One defect was found on the full read: the Airwallex (281e) greeting ran into the first sentence ("Dear Hiring Manager, I am writing..."). That is now fixed in code and covered by a unit test; it was NOT re-run live.
- Full read by hand of all 10 in this run: grounded in CV entries; "Black Caviar" and the pedigree work are in the profile. Remaining small issues: a few generic closings ("I welcome the opportunity to discuss this role"), one repeated "mentoring" phrase, and one letter with a long multi-paragraph body (Artificial Analysis, 301 words). None is an invented employer, degree or year.
- Claim check (warn only, user decision): flags on 4 of 10 letters. Two are generic "could not verify" warnings; two name specific claims (for example the CPG Seedcom 80% figure, which the model could not match to the profile wording). The warning is shown; approval is not blocked.
- Latency of the letter step: 27-107 s, median about 46 s. The 60 s target is not met (stronger editor chosen by the user).
- Promptfoo (`npm run eval:letters`): last passing run before the most recent guard changes; not re-run after them.
- Letters remain drafts for the applicant to review.
