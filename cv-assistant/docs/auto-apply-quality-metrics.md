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

Latest clean live run: all 10 prepared jobs on the original model chain with the stock-filler and "same organization" guards (the stronger-first-draft experiment was reverted, see below). Every letter was read in full.

- Structure (metric 7): 10 of 10 are 189-284 words, open with a greeting, name the company and role, and end with a sign-off.
- Fixed since the previous run: Decagon is no longer boilerplate (no "I am excited to apply", "What sets me apart", "senior technical stakeholders"); Neara no longer says "In the same organization".
- Still open on full read:
  - Xero 2840 credits CLARA (a Pythera project) to Harry the Hirer.
  - Airwallex 281e opened "As Senior Software Engineer for AI Tooling, I led ..." (the posting's title as experience) and mentions Kubernetes clusters that the CV does not show. A flag and a repair for the title-as-experience pattern were added after this run, so that run did not exercise them.
  - Airwallex 281e and Downer 282b used "Dear Recruiter,". A greeting normaliser was added after this run.
  - Downer 282b lists fluency in C# and SQL and familiarity with CrewAI and Microsoft Agent Framework, which echo the posting.
- Claim-check warnings (warn only): 4 of 10 letters (2840, 2835, 2861 earlier run, 281e); at least one is a false positive (2835, Mizco).
- Latency (metric 8): 62-111 s, median about 72 s. The p95 target of 60 s is not met.

Promptfoo (`npm run eval:letters`) is unstable, not green. Results across the last runs on the same code family: 2/3, 2/3, 3/3 (hollow, see below), 0/3, 2/3, 0/3. Failures vary by run: third-person letters ("Alex Tester is applying ..."), a job title used as experience, stock filler, and short letters. The detectors catch these, but the retry rounds and repairs do not reliably fix them, so the first-draft model's reliability is the open problem.

Thin-evidence policy (Contoso Cloud, whose CV items cover only a few lines): an honest letter is short. Padding it to 170 words made the model invent duties ("mentoring junior engineers", "access controls, encryption protocols, audit trails"), which no guard caught, and that run scored 3/3 only because the padding passed. The rebuild was reverted. The app now adds "the letter is short because your profile gives little to draw on" to the review warnings, and the eval accepts 100-169 words only when that warning is present.

Experiments recorded:
- Stronger first draft (`nemotron-3-ultra` first): Promptfoo improved for one run, but the live run was worse (greeting without a comma, "I - I architected", title as identity, requirement talk, a chat closer, missing sign-offs, lengths 137-342 words). Reverted to the original chain.
- Longer expansion window with a looser claim gate: garbled prose. Reverted.
- Keeping a sentence to stay above 170 words let "I hold a Master's degree in Computer Science" through. Reverted; unsupported sentences are always stripped, and the last claim-clean full-length draft is kept if verifier pruning would shorten the letter.

Letters remain drafts for the applicant to review. The mission is NOT complete at "best quality": first-draft reliability, the CLARA misattribution and posting echoes remain.
