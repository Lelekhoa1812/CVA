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

Promptfoo (`npm run eval:letters`): after best-of-3 drafts and the detector fix, 2/3 then 3/3 over two runs (5 of 6 cases). The remaining failure was a real third-person letter (131 words). Earlier runs (2/3, 2/3, 0/3, 0/3, 2/3, 0/3) were partly distorted: a first version of the third-person detector counted the sign-off name as "name in the body", so several earlier "third-person" failures and the 0/3 runs were false positives of that detector, now fixed with a test. Real failures seen: third-person openings, job title as experience, stock filler, short letters.

Best-of-3 drafts were tried and reverted. Promptfoo went 2/3 then 3/3 with it, but two live runs on the real app got worse: the rotated model orders put weaker models first and the draft was chosen by guard score, not prose quality. Live letters had garbled sentences ("As Senior Engineer - AI Platform candidate, my production-grade architect ..."), a closing sentence after the sign-off, contact lines in the body, and invented duties. Lesson: Promptfoo on a three-item fixture does not predict real-job quality; the live 10-letter read is the gate.

Latest live run (best-of-3 reverted, guards kept), 10 letters, 94-121 s each: all have a greeting; 5 of 10 are clean on read. Defects seen: a garbled company name ("Airwalexecss", 281e), "I at Xero: I designed ..." (2856), a run-on title sentence (281f), requirement talk ("matching your requirement for ...", 284b), posting echoes and a contact line in the body (2861, 281e), and a 148-word letter with invented mentoring (2823, flagged short). After this run these were addressed with tested deterministic repairs and detectors: stray "I at <Company>:" label, garbled company name restored, run-on title sentence, "matching/addressing your need/requirement" talk. Not yet re-read live.

Final live run on the pushed code (2649022), 10 letters, 57-128 s each: 5-6 of 10 read as clean (2840, 282b, 2856, 2826, 281e, and 2861 apart from one posting echo). Defects found: contact lines and a missing sign-off flagged on 284b (a detector false alarm: contact details under the name are by design), single-block letters (281f, 2823), the posting's title used as employment (2835, 281f), "systems programming" and mentoring claims echoing the posting (281f, 2835), and two letters of 158-167 words that were correctly flagged short. After that run these were handled with tested changes: contact lines no longer trip the sign-off or fragment checks, walls of text are split into paragraphs, "<Title> at <Company>, I ..." is repaired to "I ...", and "Subject:" lines and repeated greetings are removed. Those changes are covered by unit tests (50 pass) but not yet re-read on a live run.

Promptfoo variance after these changes: 3/3, then 1/3 on the next run (a "Subject:" line with a duplicate greeting, "I am excited", and padding with invented elaboration such as "improving customer satisfaction"). The small first-draft model still invents plausible detail that no deterministic guard catches, so letters remain drafts that the applicant must review. This is the main open quality risk.

Still open: Contoso's letter says its triage bot "demonstrates my ability to build and own security tooling", a stretch copied from the posting. The model-based claim check warns about it, but the deterministic guard does not.

Thin-evidence policy (Contoso Cloud, whose CV items cover only a few lines): an honest letter is short. Padding it to 170 words made the model invent duties ("mentoring junior engineers", "access controls, encryption protocols, audit trails"), which no guard caught, and that run scored 3/3 only because the padding passed. The rebuild was reverted. The app now adds "the letter is short because your profile gives little to draw on" to the review warnings, and the eval accepts 100-169 words only when that warning is present.

Experiments recorded:
- Stronger first draft (`nemotron-3-ultra` first): Promptfoo improved for one run, but the live run was worse (greeting without a comma, "I - I architected", title as identity, requirement talk, a chat closer, missing sign-offs, lengths 137-342 words). Reverted to the original chain.
- Longer expansion window with a looser claim gate: garbled prose. Reverted.
- Keeping a sentence to stay above 170 words let "I hold a Master's degree in Computer Science" through. Reverted; unsupported sentences are always stripped, and the last claim-clean full-length draft is kept if verifier pruning would shorten the letter.

Letters remain drafts for the applicant to review. The mission is NOT complete at "best quality": first-draft reliability, the CLARA misattribution and posting echoes remain.
