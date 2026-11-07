# Verification run log

This page records what was actually run against the live app and the eval suite while the documentation was refreshed on 2026-11-07. It separates what was exercised from what was only read in code, and it records failures as they happened. The feature docs describe behaviour; this page describes what was observed.

## Setup

| Item | Value |
|---|---|
| Date | 2026-11-07 (AEDT) |
| App server | `next dev` on port 3100, the development server already running in the project. A second preview server on port 3101 was started first, then stopped, because two `next dev` processes sharing one `.next` cache produced "missing required error components" errors. All browser checks after that used port 3100. |
| Account | The test account supplied for this run. Credentials were read from the environment and are not recorded here. |
| Browser | Headless Chromium through Playwright 1.60, at a 1440 px viewport. A 390 px viewport was used for mobile captures. |
| Personal data | The profile API response was rewritten in the browser to placeholder contact details, and the page text was masked before each screenshot. The generated PDFs contain the real profile and were kept out of the repository. |

## Results by flow

| Flow | Exercised | Outcome |
|---|---|---|
| Sign-in and home | Signed in, opened home in light and dark themes, phone width, mobile navigation | Pass |
| Sign-in errors | Wrong password on `/login`; account creation form opened, not submitted | Pass (error shown, no account created) |
| Profile | Page sections, Import Text dialog opened and cancelled, Enhance on one experience | Pass. The Enhance request ran and returned. The save request was intercepted so the stored profile was not changed. |
| Resume Lab: selection and coaching | Five items selected, Tailor toggled, Manual AI coaching toggled, styling preferences filled and saved, content enhancement toggled, Start Questions opened | Pass for the UI states. Styling saved. Content coaching was not run to completion. |
| Resume Lab: PDF | Style picker, Generate, PDF returned | Pass. `POST /api/generate-resume` returned 200 with `application/pdf`. Headers: 3 experiences, 2 projects, one page, ATS score 84, style fallback used, not truncated. The file opens and its text extracts (name, contact line, summary, experience). |
| Cover letter: evidence | Job description entered, AI Coaching run | Pass. Six evidence items ranked. |
| Cover letter: letter | Three clarification decisions answered, letter generated | Pass. `clarifications` 200, `cover-letter` 200. The letter rendered. |
| Cover letter: PDF | Export PDF | Pass. `POST /api/generate/cover-letter/pdf` returned 200 with `application/pdf`, filename `<company>-cover-letter.pdf`, about 21 KB. The file opens and its text extracts. |
| Cover letter: Advanced Mode | Run twice. Run 1: two decision questions were shown and not answered, so no letter was produced. Run 2: both decisions answered, then `POST /api/generate/cover-letter` returned **504** after about four minutes. | **Fail.** The letter was not generated. The draft area was empty afterwards (see the screenshot below). |
| Job Search: live run | Title, location and platforms set, Search run to completion, results panel read | Partial. See the Job Search findings below. |
| Auto Apply: read-only | Brief, Matches, Review and Apply steps viewed on the existing account (96 ranked roles, 10 prepared) | Pass for viewing. Nothing approved, edited or submitted. |
| Auto Apply: prepare | A two-application prepare run was started from the Brief step (`PATCH` then `POST .../run`, both accepted). The run then stopped early. The page shows "The last run stopped early. Press Prepare to continue where it left off." A resume attempt found no Prepare button. | **Not verified. The run did not complete.** The cause is not known. The account still shows 4 ready and 0 applied, so no new applications were prepared. |
| Control Room: overview and lead | Overview, one lead detail opened | Pass for viewing. The specialist workflow was not run. |
| Control Room: specialist workflow | Run once on one lead (`POST /api/control-room/leads/<id>/orchestrate`, 200 in about 5 s) | Pass with a caveat. The lead ended `scored`, fit 43, recommendation `skip`, `analysisSource: fallback`, `model: heuristic`. The LLM strategist did not produce the result and the response does not record why. The lead is a Talent.com record whose title is "Show more" and whose company is empty, so the result is not meaningful. Each run appends events and an evaluation to the lead. |
| Promptfoo cover-letter eval | `npm run eval:letters`, 3 cases, live model calls, run twice | **Run 1: 1 of 3 passed. Run 2: 3 of 3 passed.** The same inputs gave different outcomes, so the eval is not stable. See below. |
| Live autofill matrix (`scripts/autofill-live.ts` logic) | Run per form and per engine, after the user approved it. The forms were the public Greenhouse, Ashby and Lever test pages used by the script, with placeholder applicant details. Nothing was submitted. | **7 of 9 passed.** Ashby and Lever passed on Chromium, Firefox and WebKit. Greenhouse passed on WebKit (5 of 5, city shown as "Melbourne, Victoria, Australia") and failed on Chromium and Firefox with 4 of 5: the "Location (City)" field ended as `partial`. The in-page filler cannot finish that async city search in those two engines. `scripts/agent-fill.ts` handles it with real keyboard input. |
| `agent:fill` | Not run | A run against the public Greenhouse test page with a placeholder pack was attempted and was refused by the permission classifier, so it did not start. It needs the user to allow it. |
| Safari autofill script | Not run | `safaridriver` could not be set up in this environment. |

Evidence screenshots from these two attempts:

![Auto Apply after the prepare run stopped early](../../imgsrc/auto-apply/prepare-resumed.png)
*The Review step after the run stopped early. The status line says the last run stopped and asks for Prepare to be pressed again.*

![Advanced Mode draft area after the 504](../../imgsrc/generate/advanced-result.png)
*The letter area after the Advanced Mode request returned 504. No draft was produced.*

## Job Search findings (live run)

- The title "AI Engineer" and location "Melbourne" produced 128 results in about 141 seconds across the platforms that returned data.
- SEEK and Indeed returned HTTP 403 and were marked blocked, after a fallback attempt.
- CareerOne and Adzuna completed. Talent.com was still running when the panel was read.
- The panel reported "The search could not complete." in one of the two runs.
- Many CareerOne cards are not AI Engineer roles. Examples on the first page were Retail Manager, Beauty Therapist, Baker / Pastrycook and Handyperson. The title query was not enforced for that board.
- Cards from that board show "Company TBD" and "Location TBD" and "Posted time unavailable" when the board does not supply those fields.
- One card description showed an undecoded HTML entity (`&amp;`). Fixed afterwards; see "Defects investigated and fixed".
- Reloading the page clears the results. The campaign and leads remain in the Control Room.

## Cover-letter eval failures (Promptfoo, 2026-11-07)

Export file: stored in the scratchpad of the run, not in the repository. Command: `npm run eval:letters`. Result: 1 passed, 2 failed, 0 errors. The eval exited with code 100 because of the failures.

| Case | Result | Failing check | Detail |
|---|---|---|---|
| Northwind Labs, AI Engineer (run 1) | Fail | Defect check: refers to the applicant by name in the body (third person) | 249 words. The check is a regression for a known defect. |
| Contoso Cloud, Senior Machine Learning (run 1) | Fail | Defect check: no sign-off with the applicant's name | 241 words. Claim check also listed three warnings, though the unsupported list was empty. |
| Fabrikam, Software Engineer (run 1) | Pass | None | 121 words, flagged to the applicant as short because the profile is thin. |

The three warnings on the Contoso case quote claims ("architected scalable ETL workflows...", "became the backbone of the support team...", "integrating model inference steps...") that the warning text says the candidate evidence does not state. The unsupported list is empty for that case, so these are warnings only. They are the same kind of internal warning noise listed in `docs/auto-apply-quality-metrics.md`.

The eval asserts 170 to 400 words. The letter prompt asks for 250 to 350 words. The two documents disagree, and this is recorded in the cover-letter feature doc.

**Rerun:** a second run of the same suite passed all three cases (`Results: 3 passed`, exit 0). The first two defects did not recur on that run. Model output varies between runs, so a single eval result is not a reliable pass or fail signal.

**Root cause (traced after the run, from stored eval outputs and the code).**

- **Third person (Northwind).** The writer prompt never requires first person. Only the grounding editor asks for it, and that pass runs only when under 50 s have elapsed. The name rule in `src/lib/cover-letter-service.ts` then matched only "is applying/writing/submitting", so "Alex Tester designed and built..." passed repair. The eval recomputes defects on the final text, so it failed.
- **Sign-off (Contoso).** The model put the name and email before its closing sentence. Repair skipped adding "Sincerely," because the name was in the last three lines, and the check never tested the name itself.
- **Why runs differ.** No temperature or seed is sent. Repair passes are time-gated (retry and grounding under 50 s, verifier under 85 s, expansion under 100 s), and cases took 86 to 125 s. Promptfoo runs four cases at once, so they share model keys.
- **Fix status.** Commit `2504a11` (another session) fixes the sign-off shape and most third-person shapes. Replaying 82 stored letters through it: sign-off defects 1 to 0, third-person defects 12 to 6. The remaining cases are title run-ons and "Name, who..." appositives. No eval has run since, so the fix has no live evidence.
- **Blind spot.** The eval's unsupported-claim check ignores the model claim check, so the Contoso letter with three unsupported claims ("terabytes", "backbone", "model inference") still passed.

**Status:** the first run's defects are real occurrences of the failure, and the letter agent is not changed by this documentation work. The eval should be run several times before a result is trusted. Any fix needs a decision from the user.

## Data written by these runs

These runs used the real account, so they wrote records to the database:

- **Search campaigns and leads.** Each Job Search run creates a `SearchCampaign` and `JobLead` documents. Each Job Search run in this session created a campaign and its leads. The Control Room lists campaigns from this session's runs and from earlier runs, all titled "AI Engineer • Melbourne" or similar. The app has no delete action for them, so they can only be removed from the database.
- **Cover letter, Resume Lab and coaching runs.** These may store `GeneratedArtifact` or `TailoringRun` records. This was not checked against the database.
- **Profile.** Unchanged. The save request was intercepted.
- **Auto Apply and Control Room.** Read-only in this run.

These records were not removed. Remove them if they are not wanted.

## Defects investigated and fixed (committed as 51bd429)

| Defect seen in the run | Finding | Change | Re-run live? |
|---|---|---|---|
| Auto Apply "stopped early" message named a Prepare button that does not exist after a stalled search | The message was one fixed string. The stall itself came from the process ending while the dev server restarted, which is not an app defect | `stalledRunMessage(phase)` in `state.ts`: Matches and Prepare for a stalled preparation, "Press Search again" for a stalled search. Test added (`test:auto-apply` 55 of 55) | **Message: yes. Prepare: no.** A second live run (search with a maximum of 2 applications) stopped early about 50 s in, and the page then showed the new text "The last search stopped early. Press Search again to continue." The `next dev` process on port 3100 had been restarted at about 22:47 AEDT, roughly 50 s after the run began, which matches the heartbeat stopping. The run was killed by that restart, so prepare and the apply handoff were again not reached. A clean run needs a server that is not restarted |
| Advanced Mode returned 504 with no letter | The advanced run used the whole 240 s request limit, leaving nothing for a fallback. The route also had no `maxDuration` | Advanced Mode has its own 150 s budget, then the standard writer runs and the letter carries a warning. `maxDuration = 300` is exported | **Yes.** Two live runs after the fix. The UI run returned 200 after about 161 s, where it had returned 504 at about 4 minutes. A direct request returned 200 in 167 s with `advancedFallback: true`, no trace, a 190-word letter and the warning "Advanced Mode did not finish, so the standard writer wrote this letter." So the fallback works. Advanced Mode still did not finish inside 150 s, so it did not produce its own letter in either run |
| `&amp;` in Job Search card text, and a lead titled "Show more" | HTML entities were not decoded in JSON-LD text, and a UI control label was accepted as a title | Decode once, skip listings with no real title. 3 tests added (`test:search` 15 of 15) | No. Offline tests only |
| Cover-letter eval passed 1 of 3, then 3 of 3 | Model output varies between runs. A separate session added deterministic repairs for third-person sentences and misplaced name blocks (commits 9c8efe5 and 2504a11) and tests for them | Not part of this documentation change | **Re-run once after those commits: 2 of 3 passed, exit 100.** Contoso Cloud failed with a 106-word letter ("too short"), a third-person body sentence, and the unsupported claim "employment at Contoso Cloud". The eval is still not stable, and the third-person gap that `2504a11` left (title run-ons and "Name, who..." appositives) is the likely cause |

Still open, and needing a product decision: Job Search relevance for boards that ignore the keyword (default the Match filter to strong, improve the matcher, or pause CareerOne), and Advanced Mode latency (a faster model preset or fewer steps).

## Not verified

- Auto Apply prepare and the apply handoff. Two live runs were both ended by dev-server restarts, so only the new stall message was seen live.
- Cover-letter Advanced Mode producing its own letter. It did not finish within its 150 s budget in either re-run, so only the fallback path was seen live.
- `agent:fill` and the Safari autofill script.
- The eval is still unstable after the letter-guard commits (2 of 3 on the re-run).
- Job Search results from the blocked platforms.
