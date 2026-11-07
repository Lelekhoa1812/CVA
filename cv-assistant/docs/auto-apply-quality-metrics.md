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

Final live run of all 10 prepared jobs (latest guards), every letter read in full.

- Structure: all 10 are 194-299 words, open with a proper greeting and name the company; no run-on title openings or chat lines after the detector fixes. Sign-offs present.
- Clean on full read (5): Xero Senior Engineer AI Agentic (2840), Xero ML & AI Systems (284b), Xero AI Platform (2835), Downer (282b), Artificial Analysis (2826), Airwallex Senior (281e). Note: that is 6; treat 2826 and 281e as clean on the read.
- Defects still open on full read:
  - Decagon (2861): an opening that uses the job title as experience ("As an Agent Deployment Engineer, I built..."); "interface confidently with senior technical stakeholders to define success criteria" echoes the posting; "inventory and logistics operations" is not in the CV evidence as far as I can verify.
  - Airwallex Staff (281f): "Python and Go, and cloud infrastructure including Kubernetes deployments directly supports your requirements" (Go not verified; requirement-talk); the Mizco gates claim is flagged as unsupported, though the CV does contain it (a false positive).
  - Xero Senior SWE ML & AI (2856): "secured drone medication delivery" is a dubious verb for the project; "MIMIC-IV data" needs verification against the CV.
  - Neara (2823): "As Senior Machine Learning Engineer, I developed an AI medical chatbot" (title used as identity); "86% BertScore" is attributed to the Agentic RAG work across projects; "physics-enabled digital twins" echoes the posting.
- Claim check (warn only, user decision): flags on 3 of 10 letters in this run.
- Latency of the letter step: 48-110 s, median about 55 s. The 60 s target is not met (stronger editor chosen by the user).
- Promptfoo (`npm run eval:letters`): 3 of 3 pass on the latest guards.
- Letters remain drafts for the applicant to review. The mission is NOT complete at "best quality": the content-level defects above need a stronger verifier or human review.
