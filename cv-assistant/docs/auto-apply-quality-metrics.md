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

Latest live run: all 10 prepared jobs with the independent verifier pass (commit 18edba0). Every letter was read in full.

- Structure (metric 7): 10 of 10 are 191-288 words, open with a greeting, name the company and role, and end with a sign-off. No guard defects.
- Content still open on full read (metric 7 is not fully met):
  - Decagon (2861): generic boilerplate ("I am excited to apply", "What sets me apart", "Looking forward to discussing"), JD-style phrasing ("senior technical stakeholders", "operational needs"), and "integration pipelines connecting AI agents to CRMs and ticketing systems", which is not confirmed by the CV evidence.
  - Neara (2823): "In the same organization" presents the horse-breeding project as if it were Harry the Hirer work. This is a misattribution risk.
- Claim-check warnings (warn only, user decision): 3 of 10 letters (2840, 282b, 2826). The warnings list internal notes as claims, for example "Candidate clarification answers are empty..." (282b) and "The candidate claims to have built..." (2826). The warning text needs cleaning before it is shown to the applicant.
- Latency (metric 8, before the model change): 47-154 s, median about 76 s; eval letters with the stronger first draft took 96-108 s under 4-way concurrency. The p95 target of 60 s is not met. The stronger grounding editor and verifier pass cost this time.
- Promptfoo (`npm run eval:letters`) after the first-draft model change below: 2 of 3 pass. Northwind (257 words) and Fabrikam (293 words) are clean. Contoso Cloud (a thin-evidence case against a demanding posting) ends at 146 words, flagged "too short", and includes an unverified "owned Python services end to end ... operated ML systems in production" line the claim lexicon does not catch.

Changes made from this run (user chose "Stronger letter writer"):
- The first draft now tries `nvidia/nemotron-3-ultra-550b-a55b` first (laguna and deepseek remain as fallbacks). Before this, two runs in a row failed on 148-164 word letters.
- Unsupported sentences are always stripped. An intermediate version kept a sentence to stay above 170 words and let "I hold a Master's degree in Computer Science" through (copied from the posting's "a plus"); that was reverted.
- If verifier pruning would leave a letter under 170 words, the last claim-clean full-length version is kept.
- Tried and reverted: a longer expansion window with a looser claim gate. It produced garbled prose ("Alex Tester, who built ... is ready to own security tooling").

Letters remain drafts for the applicant to review. The mission is NOT complete at "best quality" while the content defects above remain open.
