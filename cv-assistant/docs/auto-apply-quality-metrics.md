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

Final live run of all 10 prepared jobs (after the greeting fix), every letter read in full:

- Greeting fix confirmed live: all 10 open "Dear Hiring Manager," on its own line.
- Structure: all 10 are 197-262 words, name the role and company, have paragraphs and a sign-off.
- Open defects found on the full read:
  - Airwallex Senior (281e): opening run-on "Senior Software Engineer, AI Tooling at Airwallex - AI platform architect with production Kubernetes experience who built AI infrastructure..." and a closing chat line ("Let me know if you would like to discuss...").
  - Airwallex Staff (281f): "Thank you for your consideration" followed by a second closing sentence.
  - Neara (2823): "multimodal output optimization" and "LLM-driven multimodal interfaces" are not in the CV evidence.
  - Airwallex Senior (281e): "production Kubernetes experience" and "serverless workloads" are not clearly supported; not flagged by the guards.
- False-positive warnings: "CPG Seedcom" role wording (Xero 284b) and "Australia's largest event enterprise AI transformation" (Downer 282b) are in the CV summary, so the warnings are noise.
- Claim check (warn only, user decision): flags on 4 of 10 letters.
- Latency of the letter step: 25-102 s, median about 47 s. The 60 s target is not met (stronger editor chosen by the user).
- Promptfoo: last passing run predates the latest guard changes; not re-run.
- Letters remain drafts for the applicant to review. The mission is NOT complete to the "best quality" bar: the defects above are open.
