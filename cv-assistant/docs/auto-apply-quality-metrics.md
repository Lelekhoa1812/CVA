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

State after commit bfb9c90. The gate is a full read of 10 live letters, not Promptfoo: Promptfoo on a three-item fixture did not predict real-job quality.

**Last full live read (code 2649022), 10 letters**
- 5-6 of 10 read as clean: 2840, 282b, 2856, 2826, 281e, and 2861 apart from one posting echo.
- Defects seen: single-block letters (281f, 2823); the posting's title used as employment (2835, 281f); "systems programming" and mentoring claims echoing the posting (281f, 2835); two letters of 158-167 words, correctly flagged short; a contact line under the name wrongly flagged as a missing sign-off (284b).
- Latency (metric 8): 57-128 s per letter. The p95 target of 60 s is not met.
- Claim-check warnings (warn only): on roughly 3-4 of 10 letters; at least one is a false positive.

**Fixed since that read (unit tests, 50 pass; not yet re-read live)**: contact lines no longer trip sign-off or fragment checks; walls of text are split into paragraphs; "<Title> at <Company>, I ..." is repaired to "I ..."; "Subject:" lines and repeated greetings are removed; garbled company names and stray "I at <Company>:" labels are repaired; stock filler, "in the same organization", title-as-experience, third-person and requirement-talk are flagged.

**Promptfoo (`npm run eval:letters`)**: varies run to run, 1/3 to 3/3 on the latest code. Typical failures are a model slip the retry did not fix (duplicate greeting, "I am excited") and padding with plausible invented detail ("improving customer satisfaction"). The small first-draft model still invents detail that no deterministic guard catches, so letters remain drafts that the applicant must review.

**Thin evidence (Contoso Cloud)**: an honest letter is short. Padding to 170 words made the model invent duties (mentoring, encryption, audit trails), which no guard caught. The app now adds "the letter is short because your profile gives little to draw on" to the review warnings, and the eval accepts 100-169 words only when that warning is present.

**Experiments tried and reverted**
- Stronger first draft (`nemotron-3-ultra` first): better on Promptfoo for one run, worse live (greeting without a comma, "I - I architected", title as identity, requirement talk, missing sign-offs).
- Best-of-3 drafts on rotated model orders: Promptfoo 2/3 then 3/3, but worse live (weaker models first, chosen by guard score not prose quality; garbled sentences, closers after the sign-off, invented duties).
- Longer expansion window with a looser claim gate: garbled prose.
- Keeping a sentence to stay above 170 words let "I hold a Master's degree in Computer Science" through (copied from the posting's "a plus"). Unsupported sentences are always stripped; the last claim-clean full-length draft is kept if verifier pruning would shorten the letter.

**Open**
- Posting echoes with no CV support (Contoso: "ability to build and own security tooling"; Downer: C#, CrewAI) are warned about by the model check but not caught by a deterministic guard.
- Xero 2840 once credited CLARA (a Pythera project) to Harry the Hirer.
- Latency is above target.

Letters remain drafts for the applicant to review. The mission is NOT complete at "best quality".
