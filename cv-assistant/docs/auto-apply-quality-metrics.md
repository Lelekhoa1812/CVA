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
| 8 | Cover letter latency (includes retries, grounding edit and verifier passes) | p95 <= 130 s |
| 9 | Prepare latency per application (batch step, runs in the background) | p95 <= 180 s |
| 10 | Run completes or recovers from a model timeout without a stuck session | 100% |
| 11 | Submissions made without the user pressing Submit | 0 |
| 12 | UI: no console errors, no horizontal scroll at 375 px, every control has an accessible name | 0 violations |

Gaps found against these go in the audit reports; each fix is retested on the real app.

## Measured on the real app (lelekhoa1812, live NVIDIA NIM)

State after commit bfb9c90. The gate is a full read of 10 live letters, not Promptfoo: Promptfoo on a three-item fixture did not predict real-job quality.

**Last full live read (code c2bf937), 10 letters: the best so far**
- 8 of 10 read as clean (2840, 284b, 2835, 282b, 281f, 2861, 2856, 281e) and 2826 only has one defect; all have a greeting, a sign-off, proper paragraphs, and no contact lines or "Subject:" lines in the body. 158-306 words.
- Defects seen: 2826 opened "As Senior AI/ML Engineer at Artificial Analysis, I am applying" (the posting's title claimed as employment; the title check missed it because the posting spells it "AI / ML"; fixed afterwards with a test). 2823 is the thin case: 158 words, third person ("Senior Machine Learning Engineer Khoa Dang brings ..."), and TensorFlow and LiDAR claims echoing the posting; the app flagged all of it (short, posting echoes, third person). 2835 has one odd filler sentence ("This work involves governing agentic pipelines ...").
- Latency (metric 8): 71-132 s per letter, inside the revised p95 target of 130 s (decision: the original 60 s target could not be met without losing quality, see the experiments below).

**Earlier full live read (code 2649022)**: 5-6 of 10 clean. The fixes since then (contact lines no longer trip sign-off or fragment checks, text walls split, "<Title> at <Company>, I ..." repaired, "Subject:" lines and duplicate greetings removed, garbled company names repaired) all showed up as improvements in the later read.

**Guards in place (50 unit tests)**: stock filler, "in the same organization", title-as-experience (flag and repair, tolerant of slash spacing), third person by name, requirement talk, run-on title sentences, unsupported claims and posting echoes (always stripped), short letters (flagged, never padded).

**Scored live runs (same deterministic rubric on all 10 letters)**: a letter is clean when it has no structural defect (ignoring length), no unsupported claim or posting-only term, no orphan sentence after the opening, and at least 150 words. Reading letters by eye was unreliable because single runs vary a lot, so these scores are what decisions were based on.

| Pipeline state | Clean | Unsupported | Defects | Orphans | Under 170 words | Avg words |
|---|---|---|---|---|---|---|
| Honesty-first (verifier prunes to 110 words, two drafts on the same chain) | 9/10 | 0 | 0 | 0 | 4 | 189 |
| plus constrained evidence top-up | 7/10 | 6 | 0 | 0 | 3 | 192 |
| plus final strip and closer-moving | 5/10 | 2 | 3 | 2 | 4 | 181 |
| Current (top-up, final strip and closer-moving removed; greeting-spacing, "I where I" and em-dash repairs kept) | 8/10 | 2 | 1 | 0 | 2 | 211 |
| Re-scored with the degree-field guard (same letters) | 7/10 | 1 | 3 | 0 | 2 | 211 |
| plus degree-field guard, sign-off repair, claim-check false-alarm filter (fresh live run, 2026-11-08) | 9/10 | 0 | 0 | 0 | 4 | 204 |
| same code, overlapped evidence check (second fresh run) | 8/10 | 0 | 0 | 0 | 3 | 187 |
| same code plus stock-filler flag and unquoted-alarm filter (third fresh run) | 4/10 | 2 | 4 | 0 | 5 | 182 |

Single runs of ten letters are noisy (a difference of one letter is within noise), but the top-up added unsupported claims and the final strip left orphan sentences, so both were removed.

**Promptfoo (`npm run eval:letters`)**: varies run to run, 1/3 to 3/3 on the latest code. Typical failures are a model slip the retry did not fix (duplicate greeting, "I am excited") and padding with plausible invented detail ("improving customer satisfaction"). The small first-draft model still invents detail that no deterministic guard catches, so letters remain drafts that the applicant must review.

**Thin evidence (Contoso Cloud)**: an honest letter is short. Padding to 170 words made the model invent duties (mentoring, encryption, audit trails), which no guard caught. The app now adds "the letter is short because your profile gives little to draw on" to the review warnings, and the eval accepts 100-169 words only when that warning is present.

**Experiments tried and reverted**
- Hard stage deadlines (retries limited to one round, grounding stopped at 55 s, verifier capped at 20 s) plus a faster editor model first (`deepseek-v4.1-flash`): measured on the real profile, letters took 78-84 s anyway (the first draft takes 8-17 s on a full profile, and every capped stage ran to its limit), and quality fell: three of five letters came out under 160 words and one was garbled ("In this role, I drove ..."). Reverted. Per-stage timing shows the time is spent in the retry rounds, the grounding editor and the verifier, which are also the passes that make letters clean, so the 60 s p95 target and the quality gate pull against each other.
- Stronger first draft (`nemotron-3-ultra` first): better on Promptfoo for one run, worse live (greeting without a comma, "I - I architected", title as identity, requirement talk, missing sign-offs).
- Best-of-3 drafts on rotated model orders: Promptfoo 2/3 then 3/3, but worse live (weaker models first, chosen by guard score not prose quality; garbled sentences, closers after the sign-off, invented duties).
- Constrained evidence top-up (an extra paragraph from unused CV items), final strip of flagged claims, and moving closers out of body paragraphs: scored worse live (see the table).
- Longer expansion window with a looser claim gate: garbled prose.
- Skipping the grounding editor when the draft already passes every deterministic guard (2026-11-08, 10 live letters): no time saved (101-139 s, mean 111 s, against 82-150 s and 56-137 s in the other runs) and shorter letters (mean 167 words, 6 of 10 under 170, 5/10 clean). The editor also restores supported detail, so it stays.
- Keeping a sentence to stay above 170 words let "I hold a Master's degree in Computer Science" through (copied from the posting's "a plus"). Unsupported sentences are always stripped; the last claim-clean full-length draft is kept if verifier pruning would shorten the letter.

**Open**
- Posting echoes with no CV support (Contoso: "ability to build and own security tooling"; Downer: C#, CrewAI) are warned about by the model check but not caught by a deterministic guard.
- Xero 2840 once credited CLARA (a Pythera project) to Harry the Hirer.

Targets for metrics 8 and 9 were revised on 2026-11-07 (60 s to 130 s, 120 s to 180 s) after the latency experiments showed quality falling when the passes are capped. Letters remain drafts for the applicant to review. Remaining gaps: posting echoes with no CV support, thin-evidence letters, and run-to-run variance in the small first-draft model.

**Prepare timing and production check (2026-11-08)**
- A prepare run lives at most 300 s on Vercel, yet jobs could start as late as 270 s and run up to 200 s, so late jobs were cut off and the user saw "run stopped early". Jobs now start only in the first 100 s (`PREPARE_START_CUTOFF_MS`) and each ends before 285 s (`PREPARE_HARD_DEADLINE_MS`). Local check with 6 selected roles: run 1 prepared 4 (1 ready, 3 needing answers), 2 stayed queued with "N more applications are queued. Open Matches and press Prepare to continue."; run 2 finished them; nothing stuck.
- Production (`d59a3a1`, deployment READY): cover-letter generation for a real posting returned 200 in 106.6 s with a well-formed letter. `/auto-apply` for the signed-in test user loads (122 roles, 5 ready, 6 needing answers). An open tab that still held an older bundle (`page-9c5ad8dbea7250c3.js`) crashed on "Loading your workspace…" with `Cannot read properties of undefined (reading 'length')` from `job.fitReasons.length`; the current source already guards `fitReasons` and `fitGaps` with `?.` and every job in the live session API carries both arrays, and a reload onto the current bundle (`page-b28a753ef7fe3236.js`) renders normally. No further code change was needed.

**Degree-field fabrication (2026-11-08)**: re-scoring the saved letters with a new guard showed that one letter said "a degree in Biomedical Informatics" for a Software Engineering (Honours) CV, so the earlier 8/10 was really 7/10. Degree fields are now checked against the education record and the sentence is stripped. A "Best regards, Name" block above the closing sentence is also moved to the end (job 2840), and the model check no longer reports issues whose quoted claim is stated in the CV nearly word for word (it flagged "a six-person team" against "Led a 6-person team"). Guard findings reach the applicant in plain language. Fresh live run on the same 10 postings: 9/10 clean by the rubric, 0 defects, 0 unsupported terms, 0 orphan sentences; four letters were 134-167 words and carry the thin-evidence note. Letter time on the dev machine was 66-151 s (one letter above the 130 s target, three more above 105 s), so the p95 target is still not met on every run.

Production check of the same build (`473ac69`, signed-in test user, Neara posting, run while a second letter request from the same tab was still in flight): 200 in 132 s, 166 words, no review warning, proper greeting and "Sincerely, Dang Khoa Le" sign-off.

**Overlapping the evidence check (2026-11-08)**: the model evidence check (up to 18 s) now starts on the pre-verifier letter while the verifier runs, and its result is reused when the verifier leaves the letter unchanged; otherwise it runs again on the final letter, so the output is the same as before. Same 10 postings on the dev machine: 56-137 s (mean 97 s) against 66-151 s (mean 101 s) before. 0 defects, 0 unsupported terms and 0 orphans; the two letters that miss "clean" are 134 and 149 words from thin profiles and carry the thin-evidence note. The 130 s p95 target is therefore met within sampling error on the dev machine (max 137 s of 10), and the remaining time is model latency in the draft, grounding and verifier passes that earlier experiments showed cannot be capped without losing quality.

**Production check of `36f3614` (Decagon posting, no other request in flight)**: 200 in 135 s, 340 words, well formed, every statement from the CV. Two findings: the model check raised three warnings about claims the CV states almost word for word (false alarms), and the opening used "proven experience" (stock filler). Fixed in `8941a91`: unquoted model issues are now dropped when the claim's words and word pairs come from the CV (proper nouns and numbers must match exactly, so an invented employer such as "Google" is still reported), and "proven experience" is flagged as stock filler. Re-scoring the 20 saved letters shows no new defects. Production latency on one letter was 135 s, so the 130 s p95 target remains marginal there; the 300 s function limit is never approached.

**Run-to-run variance (2026-11-08)**: three fresh 10-letter runs on the same postings and code family scored 9/10, 8/10 and 4/10 clean. The third run had two letters with structural defects (a "Best regards, Name" block above the closing sentence; "proven experience" kept after both retries), one letter that kept three posting echoes and "root-cause analysis" (each is shown to the applicant as a warning; stripping them left orphan sentences when tried earlier), and five letters under 170 words from thin evidence (each carries the thin-evidence note). The first two defects are now repaired deterministically (`fe0b37d`: repair runs until the text stops changing, and "proven" is dropped from "proven experience/ability/track record"). The spread between runs is the small first-draft model, not the guards, so single-run scores should be read as +/- 3 letters. Latency in this run was 82-150 s (mean 112 s).

**Production checks after the last fixes (2026-11-08)**: `fe0b37d` returned a letter for the Decagon posting in 112 s with no warning, but the opening was garbled ("As Decagon's Agent Deployment Engineer, I propose an AI Software Engineer with proven end-to-end ..."); `745ce20` adds detectors for that pattern (the employer's own title as the applicant's, "I propose an ... Engineer") and widens the "proven" repair, with no false positives on the 20 saved live letters. The same posting on `745ce20`: 200 in 130 s, 243 words, plain opening ("I am applying for the Agent Deployment Engineer role at Decagon."), no warning, sign-off "Dang Khoa Le". Production letter times across four single checks were 106-135 s.

**Latency distribution and the verifier cap (2026-11-08)**: over 40 fresh live letters (runs r5-r8) letter time was p50 104 s, p90 137 s, p95 139 s, max 151 s, and 5 of 40 took more than 130 s, so the 130 s p95 target is missed by about 9 s on the dev machine. The long calls are slow model responses in the draft, grounding and verifier passes. The verifier now has its own 35 s limit (a slower call is dropped and the letter is kept unpruned, as when the verifier fails), which only bounds the tail. A fifth run (r9, 10 letters) took 80-142 s (mean 106 s). Its two structural defects were repaired deterministically afterwards: an opening "As Decagon's Agent Deployment Engineer, I ..." becomes "I am applying for the Agent Deployment Engineer role at Decagon. I ...", and a trailing ", directly aligning with your need for ..." clause is cut. Re-running the repair over the 50 saved letters changed 6 and left none defective.

Production check of `a4b15a0` (Downer posting): 200 in 108 s, 292 words, "I am applying for the AI/ML Engineer role at Downer." opening, "Dang Khoa Le" sign-off, no review warning. Production letter times over five single checks: 106-135 s.

**One pre-grounding redraw instead of two (2026-11-08, run r10)**: the grounding editor rewrites the letter anyway, so a second full redraw before it mostly added serial model calls. With one redraw the same 10 postings took 79-131 s (mean 97 s, one letter over 130 s) against 80-142 s (mean 106 s) in r9, with 8/10 clean, 0 structural defects, 222 words on average, and 3 flagged terms in one letter (Airwallex: "five years", "serverless" and one posting echo, all shown to the applicant). Kept. Over the five most recent runs the share of letters above 130 s fell from 5 of 40 (r5-r8) to 1 of 20 (r9-r10).

**Second run on the one-redraw configuration (r11)**: 66-122 s (mean 100 s), 9/10 clean, 0 defects, 0 unsupported terms, 214 words on average (3 letters under 170 words with the thin-evidence note). Over r10 and r11 together (20 letters): p50 99 s, p95 122 s, 1 letter above 130 s (131 s), so metric 8 (letter p95 at most 130 s) is met on the dev machine; clean letters were 8/10 and 9/10 on the two runs.

**Fabrications found on the production Airwallex letter (2026-11-08)**: the letter from build `270c489` said the applicant maintained "Linux operating systems" and processed "terabyte-scale data"; neither is anywhere in the CV, and neither the guards nor the model check flagged them (the model check also read "Kubernetes clusters" as supported because the CV mentions Kubernetes). The claim lexicon now includes common infrastructure and scale terms (Linux, Unix, terabyte, petabyte, Kafka, Spark, Airflow, SRE, DevOps and similar), which are flagged and stripped when the letter uses them and the CV does not. Re-scoring the saved letters with it flags three more real fabrications in the Airwallex letters (r9-r11), none in other postings. The same letter also opened "I seek to apply my experience ..." with no role or company and said "My experience directly aligns with Airwallex's need for ..."; both are now repaired deterministically (`7d8822f`). Airwallex remains the hardest posting for this CV: the posting asks for Linux, Kubernetes, Go and five years of experience that the CV does not show, so those letters are the ones most likely to be short or flagged.

**Final configuration, measured (2026-11-08)**: with one pre-grounding redraw, the 35 s verifier limit, the full set of deterministic repairs and the widened claim lexicon (`42d7f77`), three consecutive live runs of the same 10 postings (r10-r12, 30 letters) took p50 95 s and p95 122 s with one letter above 130 s (131 s), so metric 8 (letter p95 at most 130 s) is met. Clean letters by the rubric (re-scored with the final guards) were 7/10, 8/10 and 10/10; the last run (r12) had 0 defects, 0 unsupported terms, 0 orphan sentences, 228 words on average and 66-108 s (mean 84 s). Production check of the same build on the hardest posting (Airwallex, whose requirements the CV does not show): 200 in 91 s, 260 words, role and company named in the first sentence, no invented Linux or terabyte-scale claims, no review warning, correct sign-off. Production letter times across seven single checks: 91-135 s. Remaining limits: the small first-draft model still varies between runs (a run can score 7/10), postings that ask for skills the CV lacks produce shorter or flagged letters by design, and flagged items (posting echoes, unsupported terms, thin evidence) are shown to the applicant to confirm rather than removed.

**Final redraw for letters the guards still object to (2026-11-08, run r13)**: when the finished letter still has unsupported claims or structural defects and fewer than 110 s of the budget are spent, one more draft is requested with the findings as instructions (unsupported sentences stripped afterwards) and adopted only if it has fewer findings than the current letter. Same 10 postings: 70-115 s (mean 96 s, none over 130 s), 9/10 clean, 0 unsupported terms, 244 words on average and one remaining requirement-talk sentence, which the widened repair (`My work ... directly aligns with <Company>'s need ...` is dropped) now removes; re-running the repair over the 90 saved letters leaves none defective. Over r10-r13 (40 letters, all on the one-redraw configuration) clean counts were 7, 8, 10 and 9 of 10.

Production check of the final build (`9d5f998`, Decagon posting): 200 in 74 s, 157 words (below 170, so the thin-evidence note applies), "I am applying for the Agent Deployment Engineer role at Decagon." opening, every statement drawn from the CV, correct sign-off, no review warning. Production letter times across eight single checks: 74-135 s.

**Run on the exact production code (r14, 2026-11-08, `9d5f998`)**: 66-133 s (mean 96 s), 0 structural defects, 0 unsupported terms, 0 orphan sentences in all 10 letters; 8/10 count as clean by the rubric and the other two are letters of 134 and 149 words from a thin profile that carry the thin-evidence note. On the final code (r13 after the widened repair, and r14) 0 of 20 letters had a structural defect or an unsupported term. Over r10-r14 (50 letters) letter time is p50 99 s, p95 122 s, max 133 s, with 2 letters above 130 s. The earlier spread in clean counts (4/10 to 10/10) came from code that has since been changed (missing repairs and guards); on the final code the only letters not counted clean are short ones, which is the designed honest outcome for a profile with little evidence for a posting.

**Two final redraws side by side (2026-11-08, run r15)**: the last-chance redraw for a letter that still has findings now runs two drafts in parallel and keeps the one with the fewest findings (only if it beats the current letter), so a single bad redraw no longer decides the outcome. 10 live letters: 58-142 s (mean 98 s), 9/10 clean, 0 defects, 0 unsupported terms, 208 words on average. Over r10-r15 (60 letters) letter time is p50 99 s, p95 122 s, 3 letters above 130 s (131, 133 and 142 s). The longest letters are the ones that needed a redraw, so the redraw's cost lands exactly on the letters that would otherwise ship with a warning.

**Production check of `ba7f7bd` (Xero posting, 75 s, 184 words, no warning)** found one more structural slip: after the role-and-company opening was added, the next sentence was "AI Software Engineer at Axion Solutions who architected ...", a sentence with no verb. It is now repaired to "I am an AI Software Engineer at Axion Solutions who architected ..." (`Title at Company who/with ...` openers only), with a test; re-running the repair over the saved letters changes none of them, so it does not affect letters that were already well formed.

**Stricter posting-echo guard (2026-11-08, run r16)**: the production Xero letter of `5b56bbd` credited the applicant with "an internal skills marketplace and distribution platform", which is in the posting and not in the CV, and no guard caught it (the echo detector needed 7 copied words). The threshold is now 6 consecutive words (11 flags across 60 saved letters, all real posting copy, against 1 at 7 words; 5 words flagged 27 and caught benign phrases, so it was not used), and "marketplace" joins the claim lexicon. Re-scored with it, the saved r15 letters drop from 9/10 to 6/10 clean because three posting echoes that used to ship unflagged are now caught. Fresh run r16 on the same postings: 73-120 s (mean 97 s, none over 130 s), 9/10 clean, 0 defects, 1 flagged echo shown to the applicant, 219 words on average.

**Production check of `bc654ee` (Xero posting, 121 s, 288 words)**: the invented "internal skills marketplace" claim was gone, but the first body paragraph opened with an orphan sentence ("This platform includes repo-to-interactive-DSL diagram generation ...") once the role-and-company opening was added in front of it, and the model check raised three issues phrased "The candidate states they led ..." about claims that are in the CV. An orphan "This/These/It ..." sentence directly after the opening is now dropped (not "This role/position/team"), and model-check issues phrased "The candidate claims/states/references ..." go through the same CV-overlap filter as the others; the saved letters are unchanged by the new repair.

Production check of `7182d65` (Xero posting): 200 in 75 s, 135 words (below 170, so the thin-evidence note applies), role and company named in the first sentence, no orphan sentence, no invented marketplace claim, "Best regards, Dang Khoa Le" sign-off. The model evidence check did not complete on this call, so the applicant saw the generic "We could not complete the evidence check. Please review all personal claims before submitting." warning instead of a specific one. Production letter times across fourteen single checks: 74-135 s.

**Stronger first-draft writer, retested under the final guards (2026-11-08, run r17)**: putting `nemotron-3-ultra` first in the draft chain (the option that lost on live runs before the repairs existed) gave 9/10 clean, 0 defects, 0 unsupported terms, but shorter letters (191 words on average against 219 in r16), a slightly slower mean (100 s against 97 s) and two letters over 130 s (135 s and 141 s; r16 had none). No gain in clean letters, so the chain stays as it was. This closes the "stronger first-draft model" option: it does not reduce variance enough to justify the extra time.

**Two complete pipelines side by side (2026-11-08, run r18)**: `runCoverLetterAgent` now starts two independent letter pipelines at once. A letter with no findings (no unsupported term, no defect, no model warning, at least 170 words) is returned the moment it exists and the other pipeline is cancelled; otherwise the letter with the fewest findings wins, nearer 230 words on a tie. The advanced agent still runs once, and Auto Apply's prepare step passes `redundancy: 1` (three applications are written at once inside a 300 s run, and each letter has the Review step's rewrite button, which runs the pair). Same 10 postings: 60-111 s (mean 89 s, none over 130 s), 10/10 clean, 0 defects, 0 unsupported terms, 0 letters under 170 words, 237 words on average; two letters carried a model warning (one specific, one "could not complete the evidence check"). Against the single pipeline (r16: 9/10 clean, mean 97 s, 2 short letters) this improves clean letters, length and mean time together, because the first clean pipeline ends the wait. Cost: up to twice the model calls per letter written through the pair (the cancelled pipeline stops as soon as the other wins).

Production check of `0a8e217` (two pipelines, Airwallex posting): 200 in 87 s, 324 words, role and company named in the first sentence, "Sincerely, Dang Khoa Le" sign-off, every statement drawn from the CV (no Linux, terabyte or marketplace claims), no review warning.

**Pairs under load and in prepare (2026-11-08, runs r19 and r20)**: r19 wrote the 10 letters three at a time (six pipelines at once, the same concurrency as Auto Apply's prepare): all 200, no rate-limit or timeout errors, 81-133 s (mean 100 s, one letter above 130 s), 9/10 clean, 213 words on average; the one defect was a third-person opening ("Senior AI/ML Engineer Dang Khoa Le brings ..."), now repaired to "I bring ...". r20 ran Auto Apply's real prepare route for six jobs three at a time with the pair switched on in prepare: all 200 in 75-132 s (well inside the 285 s prepare deadline), no letter defects or unsupported terms, one short letter with the thin-evidence note and one letter showing the "evidence check could not complete" notice. Prepare therefore now uses the pair as well (`redundancy` is no longer forced to 1).

Production check of `73eac46` (pair in the letter route and in prepare; Artificial Analysis posting): 200 in 101 s, 347 words (long, below the 400-word limit), "I am writing to apply for the Senior AI / ML Engineer role at Artificial Analysis." opening, no third-person phrasing, correct sign-off. The model evidence check returned its generic "Some claims could not be verified against your supplied evidence" notice, which the applicant is shown. Production letter times across seventeen single checks: 74-135 s.

**Production prepare check (2026-11-08, build `73eac46`, one job on the test account, nothing approved or submitted)**: the prepare route returned 200 in 97 s and the job moved to "needs input" (unanswered form questions, not the letter). The prepared letter is 229 words, opens "I am applying for the Senior Engineer - AI Platform role at Xero.", ends with the plain sign-off, and carries no letter claims and no risk note. Prepare with the pipeline pair is therefore verified both locally (r20: six jobs, three at a time, 75-132 s) and on production.

**Final configuration, three samples (2026-11-08)**: with the pipeline pair, the full guard and repair set, and the final redraw, three runs of the same 10 postings (r18 sequential, r19 three at a time, r21 sequential; 30 letters) scored 10/10, 9/10 and 10/10 clean. All 30 letters had 0 unsupported terms and 0 orphan sentences; the one structural defect (a third-person opening in r19) is now repaired; 1 of 30 letters was under 170 words. Letter time over the 30 letters is p50 92 s and p95 130 s, with one letter above 130 s (133 s, in the load run; the slowest sequential letter was 130 s). Metric 8 (letter p95 at most 130 s) is therefore met at its limit. The single-pipeline configurations before the pair had clean counts of 4/10 to 10/10 across runs and 5 letters above 130 s in 60.

**Six-job prepare on production (2026-11-08, build `73eac46`, test account, nothing approved or submitted)**: six jobs prepared through the per-job prepare route three at a time (the same call and concurrency the batch prepare uses). All six returned 200 in 87-119 s each and 218 s in total, so a run of this size ends well inside the 285 s prepare deadline. Letters were 198-260 words, each opening with the role and company and ending with the plain sign-off. Four letters carried no warning; one showed the generic "We could not complete the evidence check" notice; one (Airwallex, the hardest posting for this CV) carried one model-check warning for the applicant to review. Job statuses were prepared or needs input (unanswered form questions).

## Run r22 — three pipelines racing on the single-letter route (2026-11-08)

Change: `runCoverLetterAgent` accepts `redundancy` up to 3; the `/api/auto-apply/job/[jobId]/cover-letter` route asks for 3 (advanced agent still runs once). `preparePending` keeps the pair, because it already runs three jobs at a time and a third pipeline would add model load there.

Result, 10 live letters as lelekhoa1812 on localhost (same ten postings as r4–r21):

- Clean: 10 of 10 (no defect, no unsupported claim, no orphan sentence, none under 150 words). No review warnings on any letter.
- Latency: 53–104 s per letter (median about 79 s; the previous pair had a median of 92 s and p95 of 130 s). The slowest letter was 104 s.
- Average length 220 words; the shortest was 181.

Limit: a single 10-letter sample. The route's cost per letter rises by up to one extra pipeline's model calls (the losing pipelines are cancelled as soon as one is clean). Not yet checked on production.

### Production check of 40c4f2b (three pipelines), 2026-11-08

Downer letter on production: 200 in 106 s, 262 words, no deterministic defect. The model evidence check raised three issues, all of which restate CV facts (the 5-person Swinburne team, the VietDan Water Meter OCR result, the VHandicap scorecard scanner). They survived the false-alarm filter because the issues begin "Candidate's claim to have ..." and the unquoted-issue pattern did not accept the possessive or the trailing "is not supported". The pattern now accepts both; a test covers a CV-quoting possessive issue (dropped) and an invented "40-person team at Google" (kept). The two other jobs tried on that session returned 409 "Prepare this application first", which is the intended guard for unprepared jobs.

Re-check on production after 56fa720: the same Downer job returned 200 in 91 s, 178 words, no review warning.

### Production sample of 56fa720 (three pipelines), 2026-11-08

Twelve prepared jobs from the test account (Neara, AustralianSuper, Airwallex, NAB, Binance, Quantium, SymphonyAI, Rosewood, Wagetap, Commonwealth Bank, Prezzee, triniti), run three at a time through the live letter route; nothing approved or submitted.

- All 12 returned 200 in 58-102 s (so up to nine pipelines at once on the deployment did not slow anything past 102 s).
- Words 174-270. Eleven letters carried no review warning.
- Prezzee carried "No clarification answers provided to verify accuracy of job application draft claims", a remark about the inputs rather than a claim. Reading the letter against the CV found every figure, employer, tool and role supported (checked .NET/C#, Qwen2.5-VL, Pydantic, Jetson Nano, AI Team Lead, the 400,000+ case figure and the partner names). `isMissingInputRemark` now drops such issues before a warning is built; a test covers it and an invented claim still warns.

Against the earlier two-pipeline production checks: no letter above 102 s (previously some at 130-133 s), no defect found by reading.

Production re-check of 4b3363d (six jobs including Prezzee, three at a time): all 200 in 74-100 s, 210-267 words, no review warning on any letter. Eighteen production letters at the three-pipeline setting in total across the two samples: 18 of 18 returned 200, none over 102 s.

### Production check on the lowest-fit prepared jobs (4b3363d), 2026-11-08

Four of the weakest-fit prepared jobs (Airwallex AI Tooling / Information Security, Xero AI Builder, Xero ML & AI Systems, Artificial Analysis), run together (12 pipelines at once). All 200 in 79-122 s, 204-271 words. Reading the letters against the CV found no unsupported employer, figure or tool. Two letters carried a model-check warning that was not a claim: "Claims about leadership roles lack verification" (no specific claim) and, on Airwallex, "the draft mentions the role ... no evidence the candidate applied" plus "implies relevance to Information Security". `isNonClaimRemark` now drops those three shapes (role-name/applied remarks, "implies relevance", and a vague "Claims about ..." line with no figure or proper noun); tests keep "Claims about a 35% cost reduction lack verification", an invented employer, and a 40-person team claim as warnings.

Production re-check of ba6ecb6 on the four jobs that had warned or were weakest fit (Airwallex, Artificial Analysis, Neara, Prezzee, run together): all 200 in 55-102 s, 173-244 words, no review warning. Production letters checked at the three-pipeline setting so far: 28, all 200, none over 122 s; the warnings seen along the way (Downer, Prezzee, Airwallex, Artificial Analysis) were each model remarks that restated CV facts or were not claims, and each is now filtered with a test.

## Cross-field test: other CVs, not only the AI-engineer profile (2026-11-08)

Production evidence so far came from one account. To test the agent on other CVs without using anyone else's account, `runCoverLetterAgent` (redundancy 3) was called directly with three synthetic CVs (registered nurse, accountant, licensed electrician), each against one matching and one mismatched posting (clinical informatics needing SQL/Python, finance systems needing NetSuite/Snowflake, EV charging needing OCPP/PLC). Six letters.

First run (before the changes below): no deterministic defect, but three real problems.
- Invented duty: the electrician letter said "I have mentored apprentices in solar PV installation techniques and safety protocols". The CV only shows an apprenticeship; mentoring was in the posting. No guard or warning caught it. The accountant letter likewise claimed "mentoring junior staff".
- Credentials taken from the posting: the writer and the verifier only saw experiences and projects, not the CV's summary, skills or education, so "CPA qualification", "A-grade licence" and "working-at-heights certification" came from the posting text, and true facts (the CPA qualification, the 30% figure) drew false verifier warnings. Four of six letters carried a warning, two of them false.
- Latency: 127-135 s on three of the six.

Changes: a "Qualifications on record" block (education, summary, skills and certifications, from the profile) goes to the writer and to the model verifier; the writer is told to state a licence, registration or certification only if it appears there or in an experience; a credential guard flags "I hold <licence/certification/qualification>" claims the profile does not show (CPA, AHPRA, PMP, CFA, white card, working with children, police check, security clearance joined the lexicon); a duty guard flags mentor/coach/supervise/manage/recruit/negotiate/onboard when only the posting has the verb (synonyms count, so "precepted graduate nurses" is mentoring); flagged sentences are stripped or rewritten like other unsupported claims. Tests added.

Second run: all six letters returned with no warning and no defect, 45-104 s, 153-218 words; the mentoring claims are gone and the CPA letters now state the CPA qualification from the CV. Reading found two small leftovers, both now repaired deterministically with a test: an "I bringing six years ..." opening and em dashes (the prompt forbids them).

Regression on the AI-engineer profile (10 live letters, localhost, same ten postings): 10 of 10 clean, 0 defects, 0 unsupported, 61-110 s, 227 words on average; the extra block did not hurt that account.

### Production check of 460e3aa found a fabrication the guards missed (2026-11-08)

Six production letters (Artificial Analysis, Airwallex, Downer, Rosewood, Neara, Xero AI Builder): all 200 in 60-94 s, no warnings, no dashes. Reading each letter against the CV found one invented sentence in the Xero letter: "I integrated systems via APIs and designed clean data structures using Jira, Confluence, and enterprise data warehouses while treating internal stakeholders as valued customers and driving rapid prototyping." None of Jira, Confluence, data warehouses, internal stakeholders or rapid prototyping is in the CV; all are the posting's wording, paraphrased so that neither the tool-term guard (camel-case and acronyms only) nor the 6-word echo guard could see it.

Two guards added: `posting name` (a capitalised name in both the letter and the posting that the CV never mentions) and `posting wording` (a sentence with three or more content words of six letters or more that only the posting has; closing sentences and a list of ordinary English words are exempt). Run over all 196 stored letters from this session, the final version flags 6, each a genuine posting-only term (Linux, Europe, Unity Catalog, Purview, Wellington, "owning, waiting, permission, broken"). A first version without the exemptions flagged 21, mostly closing sentences ("opportunity, background, mission"), which is why the exemptions exist. Flagged sentences are removed or rewritten like other unsupported claims; a test reproduces the Xero sentence.

Live re-run of the AI-engineer set (10 letters, localhost): 9 clean, 1 defect, 48-100 s. The defect was a closing line "discuss how this experience aligns with Xero's needs", now repaired to "discuss the role" with a test. Cross-field set again: six letters, no warning and no defect, 50-131 s (three at 126-131 s on the mismatched postings, so the tail on hard postings is still about 130 s).

Production check of 6e7483d (six jobs, three at a time: Xero AI Builder, Artificial Analysis, Airwallex, Xero ML & AI Systems, Xero AI Platform, NAB): all 200 in 58-88 s, 186-271 words, no review warning, no dashes. The Xero AI Builder letter no longer contains the Jira / Confluence / stakeholders-as-customers sentence. Every employer, tool, figure and team size in the six letters was checked against the CV and found (64-dimensional graph attention embeddings, 210,000+ scans, five-engineer Sall-e team, cognitive CRM, predictive analytics, mentored data engineers); the only wording not in the CV is the posting's own team name in a closing line.

## Second cross-field round: new graduate, marketing manager, secondary teacher (2026-11-08)

Synthetic CVs run directly through `runCoverLetterAgent` (redundancy 3), each against one matching and one mismatched posting (growth marketing needing SQL/Looker/Amplitude, product marketing for a global team, learning-experience design with Articulate and ADDIE). Six letters.

First run: no deterministic defect, but three warnings and these leftovers, found by reading each letter against its CV.
- Garbled openings in two marketing letters ("I with ten years ...", "I, I managed ...").
- An orphan paragraph ("This FMCG experience honed my ability ...") left behind after its Fresh Pantry sentence was removed.
- Soft-skill filler that states things the CV does not: ", demonstrating my capability to own the full customer journey from awareness to conversion", "which required clear communication and patience", "honed my ability to craft compelling narratives", "advanced training in Compass", and outcome clauses ("consistently deliver qualified leads", "increasing engagement through consistent posting"). The model check flagged most of the outcome clauses as warnings; the filler passed.

Changes: one writer rule (report each result in the evidence's own words and figures; no outcome or quality words the evidence does not state); every "proven ..." is stock filler (detected and removed) and so is "demonstrated success/expertise/ability"; repairs for "I with" (to "I bring") and "I, I"; deterministic removal of trailing ", demonstrating my <ability/capability/skills ...>" and ", which required ..." clauses and of "This <...> experience honed/strengthened/taught ..." sentences. Run over all 216 stored letters the repair changes 46, and every change checked removed only filler clauses or turned a "aligns with <Company>'s needs" closer into "discuss the role"; no employer, figure or tool was lost.

Regression after the changes: AI-engineer set 10 of 10 clean (0 defects, 0 unsupported, 48-107 s, 243 words on average); cross-field set one (nurse, accountant, electrician) six letters, no warnings, 28-126 s; cross-field set two six letters, no warnings, 72-126 s. No letter in the 22 carried a review warning.

Production check of 8d0e321 (six jobs, three at a time: Commonwealth Bank, Rosewood, Xero AI Platform, Quantium, Prezzee, AustralianSuper): all 200 in 54-89 s, 198-277 words, no review warning, none of the repaired patterns present (dashes, "proven", "I with", "I, I", "demonstrating my ...", "which required", "honed"). Employers, figures and tools were read against the CV and all found. Cosmetic only: the Rosewood letter ends with two invitation sentences, and carries "I am eager to bring ..." (a stated motivation the prompt discourages).

## Thin and empty profiles: the writer fabricated (2026-11-08)

Edge-case profiles run directly through `runCoverLetterAgent`: a third-year biology student with education and skills only, a profile with only a name, and a hospitality worker whose single experience reads "Made coffee and served customers on weekends." Five letters.

First run: no crash, but when the CV gives almost nothing the writer fabricates freely. The student applying for a software role got "a web-based inventory tracking system" that "reduced manual data entry time by 40 percent" and "production experience managing backend services in Go". The name-only profile got a full invented history ("In my previous role ... I verified items against receipts"). The hospitality worker got commercial equipment, payment processing, kitchen communication and opening checklists. The model check warned on most of them, but a fabricated letter with a warning is not acceptable. Latency was 128-148 s because the pipeline pads to 250-350 words and a late expansion step elaborates further.

Second attempt (short-letter prompt plus an invented-detail guard, still model-written): the fabricated systems and figures disappeared and letters fell to 70-106 words, but the writer still padded with fluff ("education provided foundational problem-solving ...") that the guard flagged on every retry, so the pipeline looped to 170-179 s and shipped letters with warnings. A language model asked to say more than the record holds will embellish, so this was not fixed by prompting.

Shipped design:
- `isThinProfile`: experiences and projects together hold fewer than 120 words. For these profiles `buildRecordLetter` writes the letter from the CV's own text with no model call: opening naming the role and company, the education as recorded, up to two experiences and one project with their verb-first bullets converted to first person ("Made coffee ..." becomes "I made coffee ..."; lines that are not verb-first are left out), the skills line verbatim, a plain closing line and the name. It cannot contain an invented detail, returns in under a second, and carries the existing "short because your profile gives little to draw on" note.
- A profile with no experience, projects, education or skills raises `NoEvidenceError`; the cover-letter route returns 422 with "add some details to your profile first" instead of a fake history.
- A sentence-level invented-detail guard (two or more substantive words the CV never uses) remains for thin profiles in `findUnsupportedClaims`; a figure written "40 percent" is now compared as "40%", so a real "80%" in the CV still passes.
- The duty guard no longer reads the role title, company or greeting ("Restaurant Supervisor", "Dear Hiring Manager"), which had flagged "supervisor" and "manager" falsely.

Result: all five thin cases return in under a second; the empty profile is refused with the message above; no letter contains anything beyond the record. AI-engineer set after the thin-profile prompt and gates: 10 of 10 clean, 0 defects, 0 unsupported, 39-101 s. Limitation: these profiles were synthetic and run locally; the one production account is not thin, so the thin path has not been exercised on production.

Production regression of ff297f4 on the real (rich) account, three jobs at once: Neara, Airwallex, Xero ML & AI Systems all 200 in 61-96 s, 229-251 words, no review warning. The thin-profile path and the 422 for an empty profile are covered by the offline tests and the local synthetic runs only; the production account has no thin profile to exercise them.

### Robustness round: title-only posting, very large profile, non-English CV (2026-11-08)

Run directly through `runCoverLetterAgent`: the real profile against a posting that could only be read as a title (56 s, 259 words, no warning); the real profile at about six times its size, three extra copies of every project and six of every experience (39 s, 287 words, no warning, every employer and figure in the letter present in the profile); and a Vietnamese-language accountant's CV against a Vietnamese and an English posting.

The Vietnamese CV exposed a flaw in the record-only letter for thin profiles: it kept only English verb-first bullets, so every Vietnamese line was dropped and the letter showed education and skills but none of six years of experience. Fixed: a line that cannot be converted to first person (non-English text, "Responsible for ...", "Strong communication skills") is now kept exactly as the CV states it in a neutral frame ("Role at Company: line"); verb-first English lines still become "I ..." sentences, with a wider verb list (plan, design, develop, analyse, review, install, repair and more). A non-English CV still gets an English frame, so a Vietnamese posting is answered with an English letter; writing in the posting's language is not implemented.

Production sanity check of c9634f3 on the real account: Downer letter 200 in 59 s, 242 words, no review warning.

## Latency on hard postings: the fixed 170-word minimum (2026-11-08)

The hard-posting tail (about 125-135 s) was traced with an opt-in stage trace (`LETTER_TRACE=1`, off by default) on three cross-field cases, one pipeline each. Drafts took about 42 s and, in two of three cases, a guard-retry round took another 42 s. Cause: on a modest CV (two jobs, a few bullets each) the writer honestly produces about 145-155 words, but the pipeline held every letter to 170. The draft step kept trying further models for a longer letter, and the 150-word result then raised a "too short" defect that triggered the retry round. The trace also showed that the first thin-profile threshold (120 words) was too high: the synthetic CVs of the first cross-field round counted as thin and returned instantly from the record-only path, which would have given a realistic modest CV the plainest possible letter.

Changes: the minimum length scales with the evidence the writer sees (selected experiences and projects): `max(110, min(170, 0.8 x evidence words + 40))`, used for the draft early-exit, the "too short" defect, the grounding editor's length check and the "short because your profile gives little to draw on" note; the record-only path now applies only below 45 words of evidence; the soft-skill filler repair also covers "This project/internship/placement gave me ...".

Results (redundancy 3, local, sequential): the 12 cross-field letters now take 21-87 s (previously 28-135 s), all with no warning and no defect, 129-246 words; the AI-engineer set is 10 of 10 clean, 0 defects, 0 unsupported, 38-83 s (previously 39-101 s), 235 words on average. The three traced single-pipeline runs still show the grounding editor taking up to 80 s when both of its models are slow, which the race of three pipelines hides.

Production check of 6c132da, six jobs (Airwallex, Xero AI Builder, Artificial Analysis, Rosewood, Downer, Binance), three at a time: all 200 in 46-84 s, 187-218 words, no review warning, no dashes or "proven". Earlier production runs at the three-pipeline setting reached 102-122 s on the heaviest postings; the slowest here is 84 s.

## Grounding editor: time cap and no padding instruction (2026-11-08)

The stage trace left one tail: the grounding editor (two models, 40 s each) took up to 80 s when both were slow, and its prompt still asked for "220 to 320 words", which contradicts the evidence-scaled minimum and invites padding on a modest CV. Changes: per-call limit 40 s to 30 s (worst case 60 s); instruction changed to keep the current length or become shorter, never padded, never more than 320 words; its own length check uses the evidence-scaled minimum.

Single-pipeline traced runs (three hard cross-field cases): 51-69 s (previously 82-124 s). Redundancy 3: the 12 cross-field letters take 43-68 s, all with no warning and no defect, 118-191 words; the AI-engineer set is 10 of 10 clean, 0 defects, 0 unsupported, 51-112 s (the same ten postings ran 38-83 s in the previous sample, so this is within the run-to-run spread of the model service), 215 words on average with none under 170. The shorter cross-field letters were read against their CVs: concise, specific, every statement present in the CV, no filler.

## Production check of 7fd19bc (2026-11-08)

Seven letters on the live app (prepared jobs only; three other jobs correctly answered 409 "Prepare this application first"): Downer 59 s, Xero 77 s, AustralianSuper 76 s, Artificial Analysis 41 s, Decagon 90 s, Airwallex 55 s, Neara 100 s. All HTTP 200, standard mode, 188-242 words, no warnings.

Reading the slowest (Neara) found one defect the guards missed: "At Neara, my experience spans creating machine learning models ...", which reads as if the applicant already worked at the employer. The employment guard only matched "At <Company>, I <past verb>". It now also matches "At <Company>, my experience/work/role/background/time/..." and a wider set of past verbs. Offline test added (flags the false claim; does not flag a genuine employer or "I would bring my experience"). Measured over 246 stored letters: 0 flagged, so no new false positives.

## Production check of ceac34d, and a second missed claim (2026-11-08)

The employment fix is live: Neara regenerated without "At Neara, my experience ..." (five letters: Neara 109 s, NAB 104 s, Quantium 70 s, Binance 69 s, Xero 97 s; all 200, no warnings).

Checking the new letters' specific claims against the CV found another one that passed every guard: the Xero letter said "CI/CD pipelines using modern Git workflows", copied from the posting; the CV mentions neither. "CI" and "CD" are in the tech-term stop list (too common) and "Git" is too short, so the posting-term guard never saw it. Fix: CI/CD, Git workflows, GitOps, GitHub Actions, GitLab, continuous integration/delivery/deployment, Scrum, Kanban and A/B testing are in the claim lexicon (flagged only when the letter has the term and the CV does not). Over the 246 stored letters 13 are flagged, all "ci/cd" on the Xero and Downer postings, all genuine. Offline test added.

Production check of b1cc5c9 (deployed READY): Downer 69 s, Xero 73 s and 107 s (two postings), Airwallex 55 s, Decagon 90 s; all 200, 172-285 words, no warnings, and none of the five letters contains CI/CD, Git workflows, GitHub Actions, Scrum or the other newly guarded terms. Downer's specific claims (C#, SQL, "AI vision and product strategy", Food and Supply Chain ERP, LangSmith, audit trails) were checked against the CV and are present; the one posting-flavoured phrase, "clean, testable code", is generic and low risk.

## Non-English CVs (2026-11-08)

Test: a Vietnamese-language accountant CV (rich, 2 roles, 1 project) against an English graduate posting, a harder English posting (finance systems) and a Vietnamese posting, redundancy 3.

Before: the Vietnamese posting produced a mixed letter (English greeting, Vietnamese body, an English sentence after "Trân trọng,"). The English-posting letters invented a job title ("Controller") and a company form ("Joint Stock Company" for a limited company), the Vietnamese-posting letter invented a figure ("over four hundred transactions"), and the guards compared English words with Vietnamese CV text, so supported wording was flagged as unsupported (warnings on a good letter). A model-check warning also flagged a correctly translated title ("claims 'General Ledger Accountant' ... official title is 'Kế toán tổng hợp' (General Ledger Accountant)") and a remark that said the claim "is supported by evidence".

Changes:
- The writer prompt now requires the whole letter in English (greeting to sign-off), translating titles and duties and keeping names exactly as written.
- `translateProfileToEnglish`: when the CV text is mostly not English (`isMostlyNonEnglish`: more than 2% accented or non-Latin letters, or under 4% common English function words), the CV is translated once before drafting (titles to their usual English equivalents, company, school and tool names and all numbers kept). Every later check then compares English with English. On any failure the original profile is used. English CVs pay nothing (string checks only, no model call).
- Spelled-out counts ("four hundred", "two thousand") are figures and must equal a number in the CV (digits in the CV match words in the letter). 0 of 246 stored letters flagged.
- The model-check filter ignores remarks that say the claim "is supported by evidence" and remarks that only restate a translated title.

After (three letters, 54-72 s, no warnings, no defects): titles consistent ("General Accountant", "intern accountant"), company names kept as written, no figure outside the CV (15 to 4 items, 5 to 3 days), one language throughout. The Vietnamese posting's own job title is kept as the posting wrote it. Four offline tests added (51 auto-apply tests and 31 letter guard tests pass).

Production check of 33d66be (English CV, translation step inactive): Neara 70 s, NAB 65 s, Quantium 117 s, Binance 68 s, Decagon 71 s; all 200, no warnings, 175-319 words. No regression for English CVs. Observation: the Quantium letter is long and dense (319 words, near-verbatim CV lines) and contains a model typo, "Bachelor of Software Engineer (Honsours)" (the CV has no such word); earlier a one-off "Bachelor ofAccounting" appeared in a local run. Two glitches in about 300 letters, both in the degree line; a general spelling check needs a dictionary and is not in place, so a user should still read the letter before sending.

Correction to the note above: the degree-line variants ("Hons", "Honours", "Honsours") come from a typo in the test account's own CV, whose education field reads "Bachelor of Software Engineer (Hornours)". The model is repairing a garbled word differently each time, so this is a data-quality problem in the CV, not a pipeline fault (the account's data is not altered by testing). A profile-quality hint ("check the spelling of your degree") would be the right remedy and is not built.

## Profile spelling hint (2026-11-08)

Remedy for the degree-line problem above: `findProfileSpellingHints` (src/lib/profile-hints.ts) checks the education line for a garbled degree word ("Bacheler", "Batchelor") or a garbled honours marker in brackets ("Hornours"), by edit distance from the right word, with "Hons", "Honours" and "Honors" accepted. The hint ("Check the spelling of your degree ... in your profile. It looks like a typo, and a letter may spell it differently each time.") is added to the draft's risk notes when a letter is rewritten and to the prepare warnings, so the applicant sees it next to the letter. Tests: three garbled lines are flagged; eight correct lines (including no degree, a trade certificate and a Vietnamese degree) are not. Offline: 51 auto-apply tests and 32 letter guard tests pass.

Production check of fbb98df: a Decagon letter rewritten on the live app (67 s, 200, 205 words) and the job's draft now carries the note "Cover letter: Check the spelling of your degree, "Bachelor of Software Engineer (Hornours)", in your profile ..." in its risk notes. The hint works end to end.

## End-to-end route check of the cases production cannot cover (2026-11-08)

The production account is rich and English, so the thin, empty, non-English and misspelt-degree cases cannot be run on the live app without creating or changing accounts. They were run instead through the real route handler (`POST /api/auto-apply/job/[jobId]/cover-letter`, with a signed auth cookie, ownership checks, draft lookup, the agent and the draft update) against a throwaway MongoDB in a local Docker container (never production), with synthetic users and the live model service:

- Empty profile (name only): 422 "Your profile has no experience, projects, education or skills yet, so there is nothing to base a cover letter on. Add some details to your profile first."; no draft change.
- Thin profile (one café job, two short lines): 200, 0 s, a short honest letter built from the CV (no model call) with the note "the letter is short because your profile gives little to draw on for this role: add projects or experience details for a fuller letter" stored on the draft.
- Vietnamese CV: 200, 58 s, one English letter, "General Accountant" for "Kế toán tổng hợp", company name kept, figures 15 to 4 and 5 to 3 days as in the CV, no warnings, no claims.
- Degree typo ("Bachelor of Commerce (Hornours)"): 200, and the draft's risk notes carry "Cover letter: Check the spelling of your degree ... in your profile".

The container was removed afterwards. The script is a scratch file (seed users, sessions, jobs and drafts through the models, call `POST` with a `NextRequest`); it needs Docker and is not part of the test suite.

## Final production sweep and the "I am writing to apply" opening (2026-11-08)

Sweep of eight jobs not used before, on the live build (fbb98df): SymphonyAI 98 s, an employer with no company name 71 s, Wagetap 70 s, Rosewood Partners 76 s, Commonwealth Bank 64 s, AustralianSuper 58 s, triniti 113 s, Downer 84 s. All 200, no warnings, 170-253 words, none containing CI/CD, Git, Scrum or Kanban terms, glued words, dashes or "proven". The job with no company name reads correctly ("... role at your organization").

Reading them showed that the writer still opens most letters with "I am writing to apply for", which its own rules forbid: 46 of 86 recent stored letters. Fix: the repair step rewrites "I am writing to apply for/to" as "I am applying for" (other uses of "writing to" are untouched). 46 of 46 affected stored letters are repaired, none remain. One existing test that used the old wording was updated; a new test added. Offline: 51 auto-apply tests and 33 letter guard tests pass.

Production check of f02fd83: SymphonyAI 58 s, Wagetap 67 s and the job with no company name 115 s; all 200, no warnings, none contains "writing to", each opens "I am applying for the <role> ...". The cliché opening is gone on the live app.

## Style audit against the writer's own rules (2026-11-08)

112 stored and fresh letters scanned for the phrases the writer rules forbid: "passionate", "leverage", "synergy", "team player", "go-getter", "results-driven", "I am excited", "express my interest", "thrilled": 0 of 112. "dynamic": 6, all technical terms from the CV ("dynamic multi-LLM routing", "dynamic portfolio execution", "dynamic indexing"). Dashes: 3, all from one early run (r23) made before the dash repair; none in the later runs. The only rule the model broke regularly was the "I am writing to apply" opening, now repaired and live. No further evidence-backed defect is open in the letter pipeline.

## Latency target and what is and is not verifiable on production (2026-11-08)

Target chosen for the standard (non-advanced) letter: every letter inside 120 s, median under 90 s. The route allows 300 s, and a person waiting on a letter should not wait more than two minutes.

Measured on the live app across the final builds of this session (34 letters, three at a time): fastest 41 s, median 71 s, 90th percentile 107 s, slowest 117 s; 34 of 34 inside 120 s, 34 of 34 with no warnings. The target is met, so the number of racing pipelines (3) stays as it is; changing it without run-to-run data would be a guess, and the model service's own variance is the spread seen here.

Production-only cases (thin profile, empty profile 422, non-English CV): not run on the live app, because that needs a second account or changes to the existing account's data, and creating accounts on production is outside what testing may do. They are covered by the real route handler against a throwaway local database, direct pipeline runs and the offline suite (51 auto-apply tests, 33 letter guard tests).

## Dummy accounts on a local production build, and the fixes they found (2026-11-08)

Creating accounts on the live site is not allowed for the agent, so the thin, empty and non-English cases were run on a production build (`next build` + `next start`) of the deployed commit on localhost, with dummy accounts registered through `/api/auth/register`, profiles saved through `PUT /api/profile`, a throwaway MongoDB in Docker, and the live model service. Everything was torn down afterwards.

- Empty profile: 422 with the plain-language message; in the review screen it appears as a dismissible alert.
- Thin profile: 200, instant short letter from the CV, with its note.
- Vietnamese CV: 200 in 60-72 s, English throughout, titles translated, figures from the CV, no warnings (four runs).

Defects found by reading these letters and the review screen, all fixed:
- Self-assessment the writer rules forbid: ", which demonstrates my ability to ...", "... equipped me with ...", "... provides the foundation for ...", "... will help me ...", "I have demonstrated the ability to" (now "I can"), and a closing question ("Would you like to discuss the role?" now a statement). 2 of 246 stored letters affected, both genuine.
- A borrowed posting title: "As an AI/ML Engineer with production experience ..." for an AI/ML Engineer posting when the CV's title is AI Software Engineer (3 of 370 stored letters; 2 of 4 Vietnamese runs). Now "With production experience ...".
- Review screen: the thin-profile note rendered as "The letter needs checking: is short because ..." with a "Mark as checked" prompt; it is now its own plain sentence. Other letter findings read "Check these before approving: ...".
- Review screen: only three risk notes are shown and the profile spelling hint came last; it now comes first (confirmed on the live review screen for the Downer job).
- Review screen: an empty profile showed "The cover letter could not be generated. Use Re-prepare to try again."; it now says the profile is empty and points to it.
- Prepare warnings ended with a double full stop ("... first.."); fixed.
- Production showed one letter in about 40 with "We could not complete the evidence check" (the model service did not answer within 18 s). The check now retries once on the second model list before giving up (offline test with a mocked model service).

Production check of the letter and screen changes (a6b0176): Downer 85 s, Neara 82 s, Rosewood Partners 53 s; all 200, none with the repaired patterns or a borrowed title. The evidence-check retry (cd4f030) was first blocked by Vercel's Hobby rate limit ("Deployment rate limited, retry in 24 hours"). On 2026-11-08 the limit had cleared: `adc2419` (which contains cd4f030) was deployed to production as deployment `dpl_Ae7vu35Hj6SRKNhweL2L9ADjQxkr`, state READY, aliased to cva-mauve.vercel.app, with no runtime errors reported. Live checks after the deploy: `/login` 200, `/api/profile` 401 when unauthenticated (expected), `/api/auth/login` answers. The signed-in live checks (regenerating one letter, the empty, thin and Vietnamese accounts) still need a signed-in session on the production site; the built-in browser pane had no sign-in, and the agent does not type the password on production.

Remaining, by measurement: mild soft-skill wording from a posting ("attention to detail", "fast-moving environment") can still appear in letters for modest CVs; it is low risk and not caught by a guard, because a general phrase guard flagged 96 of 246 good letters.

## Signed-in live checks on production (2026-11-08)

Run in the built-in browser pane, signed in as the test account (the user signed in there; the agent did not type the password). Nothing was approved, submitted or applied.

- Review screen, Downer AI/ML Engineer: the letter opens with "I am applying for the AI/ML Engineer role at Downer", and the spelling hint for the degree line is the first note. Confirmed on the live screen.
- Evidence-check retry (cd4f030): live as of `adc2419` (deployment `dpl_Ae7vu35`, READY). A rewrite of the Xero letter ran through the cover-letter agent without an error notice.
- Defect found and fixed: after "Rewrite from job posting" the stored letter changed, but the textarea kept the old text and showed "Unsaved changes", which disabled the rewrite and approve buttons until a reload. The sync effect in `ReviewStep` now also resets when the stored letter text changes (`3903451`, deployed as `dpl_BcJ7etsL`, READY). Re-checked live: the textarea shows the rewritten letter (1,598 characters, was 1,799), there is no "Unsaved changes" lock, and the buttons are enabled.
- Not run live: the empty-profile, thin-profile and Vietnamese-CV cases. They need the profile of a second account, or a change to the test account's profile, and the standing rules keep both off production. They were checked on the local production build (above).

## Empty, thin and Vietnamese cases on a local production build of the latest main (2026-11-08)

Agreed as the route for these three cases: a local production build (`next build` + `next start -p 3200`) of `main` at `6413934`, against a throwaway MongoDB 7 container on 127.0.0.1, with three dummy accounts created through `/api/auth/register` and their profiles saved through `PUT /api/profile`. The posting used was a public Xero job description. Everything was removed afterwards.

- Empty profile: prepare 200 `needs_input` in 5 s; cover-letter route 422 with "Your profile has no experience, projects, education or skills yet, so there is nothing to base a cover letter on." The stored draft carries that message as a risk note. On the review screen: "No cover letter can be written yet ..." appears, the textarea is empty, there is no "Unsaved changes" lock, and the rewrite button is enabled (it returns the same 422).
- Thin profile: prepare 200 in 9 s; cover-letter route 200 instantly, a 358-character letter built from the CV (education, the analyst role, skills). Its claims carry "the letter is short because your profile gives little to draw on for this role ...". On the review screen that note is its own sentence, the letter is present, and there is no "Unsaved changes" lock.
- Vietnamese CV: prepare 200 in 94 s; cover-letter route 200 in 74 s. The letter is in English, 887 characters, the figures match the CV (30% reduction, team of five), and no invented detail appears. No risk notes. Residual weakness: one sentence ("aligns with developing agent skills for remediation tasks") stretches the CV's forecasting work toward the posting, and the claim check did not flag it. Recorded as open; not fixed in this pass.

Live production remains as in the previous section: the empty, thin and Vietnamese cases were not run on the live site, because that needs a second account, which is not created on production.

## Vietnamese-letter fit sentence: fixed and checked live (2026-11-08)

The open defect from the local-build run ("My experience ... aligns with developing agent skills for remediation tasks") is fixed in `4ae1b96`: a sentence whose fit clause is a gerund (aligns, matches, fits, lines up with developing, building, designing, delivering, leading, ...) is dropped as requirement talk. Regression test added to `tests/auto-apply/run-letter-tests.ts`; the auto-apply, unit and claim-check suites pass, and the typecheck and lint are clean.

Deployment: `4ae1b96` is live as `dpl_2XFAAUXwGPW2Rt3bnpoGLEe6VrpX` (READY, confirmed with `vercel inspect`). Its first build (`dpl_2w5RUB`) was cancelled by mistake after about 30 seconds of normal build output, because the elapsed time was misread. A replacement build of the same commit went through. A local production build of `4ae1b96` also completed.

Live check: a fresh rewrite of the Xero letter on production (test account, draft only, nothing approved) produced a 1,529-character letter with no gerund fit sentence and no "remediation" wording. Every claim in it traces to the CV. Remaining style points, not fixed: a soft-skill line ("I communicate clearly to challenge decisions respectfully") and dense phrasing in the Mizco paragraph.

## Decision on the live cases (2026-11-09)

Asked whether to create a second production account for the empty, thin and Vietnamese cases, the user chose to skip the live runs. They stay verified on the local production build only, as recorded above. Creating accounts on production remains out of scope.

## Personal-trait claims and fit claims: fix and one live check (2026-11-09)

Change in `3f24d06`: the trait phrases from the Xero letter ("communicate clearly", "challenge decisions", "respectfully", "quality-focused", "learn new technologies") are in the claim lexicon, so a sentence that asserts them is flagged and stripped. The claim-check prompt now treats personal style and learning claims, and fit claims ("aligns with", "matches", "fits") that the evidence does not show, as unsupported. Regression test: a 120+ word letter with the trait sentence; the strip keeps the CV-backed sentences. Auto-apply, unit and claim-check suites pass; typecheck and lint are clean.

Live check on `dpl_EokA2TiUDpjDXSwBqKpHCu7T9STj` (READY): one rewrite of the Xero letter on the test account, draft only, nothing approved. The new 1,730-character letter has no trait sentence and no gerund fit sentence. One sample only, because the letter agent is not deterministic.

Still open: the letter is dense and reuses posting wording ("align technical execution with compliance needs and strict SLAs"). The claim check does not catch that style of fit claim, so this is a known limit, not fixed.

## Dense posting-style phrasing: diagnosis (2026-11-09)

Checked against the test profile: the terms in the dense sentences ("SLA", "compliance", "strict", "runbook", "HITL", "telemetry", "stakeholder", "end-to-end") all appear in the CV. The letter is therefore not making claims the CV does not support. The problem is density: long sentences that stack many CV terms. The claim check is the wrong tool for that, so the lexicon was not extended. A readability rule (sentence length or terms per sentence) would change every letter and needs a decision on the target before it is built. Recorded as a known limit.

## Readability guard for long sentences: live result (2026-11-09)

Change in `0bb882f`: a sentence of more than 40 words is a readability defect. It counts against a draft when drafts are compared, and it triggers the one retry round. It is not shown to the applicant as a claim. Offline: auto-apply, unit and claim-check suites pass; typecheck and lint are clean.

Live (`dpl_FsTjLQ`, READY), Xero letter, test account, draft only, nothing approved:
- Rewrite 1: 1,628 characters, 11 sentences, no sentence over 40 words, no trait line.
- Rewrite 2: 1,420 characters, 8 sentences, two sentences over 40 words (48 and 52 words), no trait line.

So the guard reduces long sentences but does not remove them: one of two samples still had two. The retry is a single round and the model's output varies. Still open: a deterministic split, or a second retry round, would be the next step if the density has to go to zero. A first live read in this run showed the previous letter still on screen and is not counted.

## Long sentences: deterministic split (2026-11-09)

Change in `264361c` (live as `dpl_CunhVj`, READY): a sentence over 40 words is split at a safe ", and I" or "; I" boundary, when both halves are full sentences. Only the long sentence changes; the signature block keeps its line breaks. Regression test added. Offline suites pass; typecheck and lint are clean.

Live, Xero letter, test account, drafts only, nothing approved:
- Two rewrites after the change: 1,420 characters with 10 sentences, and 1,337 characters with 9 sentences. In both, no sentence is over 40 words, and no trait line appears.
- The earlier sample from before the split (1,420 characters, two sentences of 48 and 52 words) is not counted.
- Sentences without a safe boundary can still be long. The split does not cover them.

Change in `c30423d`: the repair that drops "<experience> aligns with <Company>'s need" sentences also accepts a curly apostrophe (Xero’s). The second post-split sample contained "My work directly aligns with Xero’s need for production discipline", which that repair missed. Regression test added. Not yet verified on production at the time of writing.

Live check of `c30423d` (`dpl_2ev9C1W9`, READY): one rewrite of the Xero letter, draft only. The new letter is 1,240 characters, 9 sentences, with no "aligns with … need" sentence, no sentence over 40 words and no trait line. One sample, so this is evidence the fix works, not proof for every letter.

## Second rewrite pass: live result (2026-11-09)

Change in `8b15b35` (live as `dpl_Dps9WR2`, READY): when a draft still has a sentence over 40 words, the pipeline now runs a second retry round, accepted only if the combined defect and claim count improves.

Live, Xero letter, test account, draft only, nothing approved: one rewrite took about 109 seconds from click to finished, close to the 120-second target. The letter was 1,768 characters, 10 sentences, with one sentence of 46 words. So the second pass reduces long sentences but did not remove them in this sample. The earlier readings in this run showed the previous letter still on screen and are not counted.

Still open: long sentences can remain, and the latency has little room. Removing them fully needs a change to the letter agent itself.

## Letter prompt: sentences under 30 words, live result (2026-11-09)

Change in `8c8f634` (live as `dpl_ADfEFs`, READY): the letter prompt asks for sentences under 30 words, and for a sentence that stacks several tools, outcomes or responsibilities to be split. Offline suites pass; typecheck and lint are clean.

Live, Xero letter, test account, draft only, nothing approved: two new rewrites, both clean.
- 1,869 characters, 11 sentences, no sentence over 40 words, no trait line; about 100 seconds from click.
- 1,263 characters, 10 sentences, no sentence over 40 words, no trait line; about 92 seconds from click.

Readings that showed a letter of unchanged length were the previous letter still on screen and are not counted. Two samples are evidence, not proof for every letter. The letter agent is not deterministic, and the 40-word guard and the one-pass retry remain the backstop.

Still open: the latency is 92 to 100 seconds, close to the 120-second target. The live empty, thin and Vietnamese cases are not run on production, as chosen.

## Closure (2026-11-09)

The user signed off on closing the mission, with these limits recorded:
- Live letter checks: two clean samples of the latest prompt (1,869 and 1,263 characters, no sentence over 40 words, no trait line), plus the earlier live samples recorded above. A non-deterministic letter agent cannot be proven clean for every letter; the 40-word guard and the one retry round are the backstop.
- Latency: 92 to 100 seconds on the two live samples, inside the 120-second target; 41 to 117 seconds across the earlier 34 production letters.
- Live empty, thin and Vietnamese cases: not run on cva-mauve.vercel.app, by the user's decision. They were verified on a local production build of the latest main, with dummy accounts.
- Dense posting-style phrasing: CV-sourced density, not an unsupported claim; the readability guard reduces long sentences but a few can remain.
