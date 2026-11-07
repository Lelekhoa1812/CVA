# Generate module: cover letter studio

Status: describes the Generate module as committed at `96a9343` (2026-11-07). No Generate module file has uncommitted changes. The Auto Apply letter service, `src/lib/cover-letter-service.ts`, has uncommitted changes in the working copy, checked at 19:26 on 2026-11-07. Appendix A describes them, and section 4.6 marks them. Paths are relative to `cv-assistant/`.

Contents

1. Purpose and scope
2. User interface walkthrough
3. End-to-end flow
4. Grounding and claim-check guards
5. Output constraints
6. API reference
7. Trace panel
8. Tests and eval coverage
9. Known limitations
10. Appendix A: working copy of `src/lib/cover-letter-service.ts`
11. Appendix B: inconsistencies and open questions

## 1. Purpose and scope

The Generate module, served at `/generate`, helps a signed-in user write a targeted cover letter for one job. The user enters a company name and a job description. The app reads the saved profile's projects and experiences, optionally ranks them against the job, optionally asks a few decision questions, drafts the letter with an AI model, runs a model-based claim check, and exports a PDF. The module can also answer one employer question in a short answer.

The module does not:

- send anything to an employer, or save a letter on the server (drafts stay in the browser, see section 2.9);
- write to the profile (every profile read is read-only);
- verify claims. The claim check is one best-effort model call. Its result is shown as a warning and never blocks the letter.

The page is labelled "Cover Letter" in the navigation (`src/components/Navbar.tsx`) and is linked from the home page (`src/app/page.tsx`).

### 1.1 File map

| Path | Role |
|---|---|
| `src/app/generate/page.tsx` | Client page: all state, API calls, draft storage, layout and messages |
| `src/components/generate/ClarificationQuestions.tsx` | Decision panel, one decision per step |
| `src/components/generate/MobileGenerateBar.tsx` | Fixed bottom bar with a hint and one button, below the `lg` breakpoint |
| `src/components/generate/ResultBlock.tsx` | Draft area: loading, empty, warning, text, actions and notice |
| `src/components/generate/SectionNavigator.tsx` | Four-step navigator with scroll tracking and keyboard support |
| `src/components/generate/TracePanel.tsx` | Renders an advanced trace |
| `src/components/generate/WorkspaceChrome.tsx` | `DisclosureSection`, `DetailsToggle`, `ChoiceRow` and `SelectableRow` |
| `src/app/api/generate/select/route.ts` | Ranks evidence (AI Coaching) |
| `src/app/api/generate/clarifications/route.ts` | Proposes decision questions |
| `src/app/api/generate/cover-letter/route.ts` | Writes the cover letter, standard or Advanced Mode |
| `src/app/api/generate/employer-question/route.ts` | Answers an employer question, standard or Advanced Mode |
| `src/app/api/generate/cover-letter/pdf/route.ts` | Renders the PDF |
| `src/lib/cover-letter.ts` | Evidence items, contact details, ranking prompt, standard letter and answer prompts |
| `src/lib/cover-letter-advanced.ts` | Advanced Mode agent: planner, retrieval, auditor, synthesiser, writer, reviewer and reviser |
| `src/lib/cover-letter-service.ts` | Shared letter agent with deterministic guards. Used by Auto Apply and the eval, not by any `/generate` route (section 4.6 and Appendix B). Has uncommitted changes (Appendix A) |
| `src/lib/generate/claim-check.ts` | Model-based claim check used by `/generate` |
| `src/lib/generate/clarifications.ts` | Decision normalisation, answer formatting and the decision prompt |
| `src/lib/generate/validation.ts` | Input validation shared by the generation routes |
| `tests/generate/*` | Six offline test files (section 8.1) |
| `evals/promptfooconfig.yaml`, `evals/provider.js`, `evals/run-letter.ts`, `evals/fixtures/profile.json` | Promptfoo regression suite for the Auto Apply agent (section 8.2) |

### 1.2 Dependencies outside the module

- `src/lib/ai.ts`: model access to NVIDIA NIM, presets, keys and timeouts (section 6.2).
- `src/lib/auth.ts`: `getAuthFromCookies` reads the `auth_token` cookie.
- `src/lib/models/User.ts`: the user record. The module reads `profile.projects`, `profile.experiences` and the contact fields `name`, `phone`, `email`, `workEmail`, `website`, `linkedin` and `languages`.
- `src/lib/api.ts`: `buildApiUrl` prefixes every API route with `NEXT_PUBLIC_BASE_PATH` when that variable is set.
- `src/app/api/profile/route.ts`: the profile read used by the page (section 6.8).
- `src/app/api/resume/pdf-layout.ts` and `src/app/api/resume/embed-noto-sans-fonts.ts`: text layout and font embedding for the PDF.
- Auto Apply (`src/app/api/auto-apply/job/[jobId]/cover-letter/route.ts` and `src/lib/auto-apply/prepare.ts`) also uses `src/lib/cover-letter-service.ts`.

### 1.3 Data handling

- Prompts carry the job description, company, employer question, confirmed decisions, the candidate's name and the text of the selected projects and experiences. They are sent to the NVIDIA NIM chat completions endpoint. The default base URL is `https://integrate.api.nvidia.com/v1`, and `NVIDIA_NIM_BASE_URL` overrides it.
- The routes only read the database. The PDF is built in memory and returned. Nothing is written to disk.
- The page keeps the form, the letter and the answer in `localStorage` (section 2.9). That data is plain text on the device.

### 1.4 Source state

No tracked file under the Generate module paths differs from `96a9343`. Those paths are `src/app/generate`, `src/components/generate`, `src/app/api/generate`, `src/lib/generate`, `src/lib/cover-letter.ts`, `src/lib/cover-letter-advanced.ts`, `src/lib/ai.ts`, `tests/generate` and `evals`. Two tracked files outside them have uncommitted changes at 19:26 on 2026-11-07: `cv-assistant/src/lib/cover-letter-service.ts` (7 lines added, modified 19:22:07) and `cv-assistant/tests/auto-apply/run-tests.ts` (13 lines added, modified 19:22:21). Appendix A describes both. The repository also has untracked files outside this module, which this document does not cover.

## 2. User interface walkthrough

### Screenshots

![Cover letter module overview](../../../imgsrc/generate/overview.png)
*Cover letter module before any input.*

![Job brief and evidence](../../../imgsrc/generate/evidence-open.png)
*The job brief filled in, with the evidence panel open.*

![AI coaching ranking](../../../imgsrc/generate/ai-coaching-done.png)
*AI coaching ranking the profile evidence against the job.*

![Generating the letter](../../../imgsrc/generate/generating.png)
*The letter while it is being generated.*

![Clarification question](../../../imgsrc/generate/clarifying-questions.png)
*The first decision question: lead proof.*

![Clarification answered](../../../imgsrc/generate/clarifying-selected.png)
*A decision question with an answer selected.*

![Generated letter](../../../imgsrc/generate/result.png)
*A generated cover letter ready to review.*

![Advanced Mode option](../../../imgsrc/generate/advanced-mode.png)
*The Advanced Mode option under the generated letter panel.*

![Employer answer](../../../imgsrc/generate/employer-answer.png)
*The optional employer answer panel.*

![Mobile view](../../../imgsrc/generate/mobile.png)
*The cover letter page on a phone-width screen.*

![Dark theme](../../../imgsrc/generate/dark.png)
*The cover letter page in dark theme.*


Quick use:

1. Enter the company and the job description (section 2.2).
2. Optionally press Run AI Coaching, or pick the evidence yourself (section 2.3). If you skip both, the letter uses the whole evidence library (section 9).
3. Press Generate Cover Letter. Answer the decision questions or skip them.
4. Read the draft and the review warning. Check every claim against your own record before you use the letter.
5. Copy the letter or export it as a PDF. For an employer question, use the Employer answer section.

The page has four sections in this order: Job brief, Evidence, Generated letter and Employer answer. On narrower screens a bar at the bottom holds the main action. Collapsible sections show "Show" or "Hide" at the right of their header.

### 2.1 Header, stats and navigation

Header (`ModuleShell`):

- Eyebrow: "Cover Letter Module"
- Title: "Build a cover letter around evidence, not generic claims."
- Description: "Use job context, AI selection, manual curation, and advanced evidence planning so the final letter sounds targeted and credible."

Stats:

| Label | Value |
|---|---|
| Mode | "Manual" when manual curation is on, "AI" when AI Coaching is on, otherwise "Open". Advanced Mode is not shown here. |
| Evidence | The evidence count (section 2.3) |
| Stage | "Advanced" when Advanced Mode is on, "Ready" when a letter exists, otherwise "Draft" |

Side panel: "Letter Strategy", the heading "Narrative with proof", a paragraph, and three fixed points: "Frame why this company matters to you", "Select evidence that maps to role requirements" and "Use Advanced Mode when the JD has many must-have signals".

Error alert (`#generate-error`, `role="alert"`): shows the page-level error. Employer answer errors appear inside the Employer answer section.

Step navigator (`aria-label="Cover letter steps"`):

| Section id | Mobile label | Desktop label |
|---|---|---|
| `job-brief` | Brief | Job brief |
| `evidence-selection` | Evidence | Evidence |
| `generated-letter` | Letter | Letter |
| `employer-question` | Answer | Employer answer |

- Selecting a step scrolls to that section (smooth, or instant when the user prefers reduced motion). A collapsed Evidence or Employer answer section opens first, and the page then scrolls to it.
- The active step is the topmost visible section (IntersectionObserver with a root margin of `-150px 0px -42% 0px`).
- Keyboard: Right and Down move to the next step, Left and Up move to the previous one (both wrap), and Home and End jump to the first and last step.

### 2.2 Job brief (`#job-brief`)

Heading: eyebrow "Job brief", title "Company and role", description "Start here. The company and job description set the letter."

| Control | Type and limits | Behaviour |
|---|---|---|
| Company name | Text, `maxLength` 300, placeholder "Google, Canva, Atlassian..." | Required for Generate Cover Letter. Used in the letter prompt, the PDF title and the PDF file name. The claim check does not receive it. Not required for the employer answer. |
| Job description | Textarea, `maxLength` 18000, placeholder "Paste the description here so the system can match requirements, responsibilities, and tone." | Required for Generate Cover Letter and Run AI Coaching. Typing in it cancels a ranking that is still running. |

### 2.3 Evidence (`#evidence-selection`)

A collapsible section with the kicker "Evidence", the title "What the letter can cite" and a meta label such as "AI Coaching · 6". It opens on load when manual curation is on or AI Coaching is off, and whenever new rankings arrive. The intro says: "Use AI Coaching for speed, or hand-pick the evidence you want included. Advanced Mode can then inspect and expand the evidence set."

| Control | Default | Behaviour |
|---|---|---|
| AI Coaching (checkbox) | On | Description: "Rank the strongest projects and experiences against the job brief, with concise relevance rationale." Turning it off cancels a running ranking. The stored selection is kept but not used. |
| Curate manually (checkbox) | Off | Description: "Pick the exact projects and experiences that should be woven into the letter." Turning it on shows the profile lists. Turning it off clears the manual selection. Either change also cancels a running ranking. |
| Run AI Coaching (button) | Not applicable | Shown only while AI Coaching is on. Label "Run AI Coaching", changing to "Ranking evidence…" while it runs. Disabled when the page is busy or the job description is empty. Calls `POST /api/generate/select`. |

Messages in this section:

- "Ranking your profile evidence against this role…" (status, while ranking).
- "Manual curation is what the draft will use while it is on." (shown when AI Coaching and manual curation are both on, because manual curation takes priority).

Manual curation panel (shown when manual curation is on):

- While the profile loads: "Loading your profile evidence…". If the profile failed to load: "Profile evidence could not be loaded. Refresh the page or turn off manual curation to continue."
- Toggle: "Hide evidence" or "Show evidence".
- Experiences: one checkbox per experience, titled `<companyName> · <role>`, with the summary as detail. The heading shows "N selected". Empty state: "No experiences added yet."
- Projects: one checkbox per project, titled with the project name (or "Untitled Project"), with the summary as detail. The heading shows "N selected". Empty state: "No projects added yet."
- With nothing selected: "Select at least one item to use manual curation."

AI Coaching results (shown when AI Coaching is on and results exist): a collapsible "AI Coaching results · N items". Each entry shows its rank, title, type and justification.

"How evidence is used" (collapsible): Mode (the evidence mode label: "Advanced agent loop" when Advanced Mode is on, otherwise "Manual curation", "AI Coaching" or "Open generation"), Evidence count, and the recommendation "Keep the letter anchored to a few strong proof points. Turn on Advanced Mode when you want the system to check missing JD skills, tools, qualifications, and qualities before drafting."

Evidence count: the final count of the last advanced run if there is one; otherwise the manual count when manual curation is on; otherwise the number of stored indices, which is zero when AI Coaching has not been run. Section 9 covers the mismatch this can cause.

### 2.4 Generated letter (`#generated-letter`)

Heading: eyebrow "Letter", title "Generated letter", description "The draft shows up here, ready to copy or export." A screen-reader-only live region announces copy results.

- Advanced mode (collapsible; label "Advanced mode · On" or "Off"). It holds the checkbox "Advanced Mode", off by default, described as "Run planner, evidence-retrieval, synthesis, and reviewer loops before writing the final answer." The setting also applies to the employer answer.
- Generate Cover Letter (primary button). It is shown when no decision panel is open. It is disabled when the page is busy, the company or job description is empty, or manual curation is blocked. Its label changes to "Preparing optional questions…" while decisions are fetched, and to "Running advanced cover letter agent..." or "Generating cover letter..." while the letter is written.
- While decisions are being prepared: "Choosing the few decisions that will change this letter…" and the secondary button "Skip decisions and generate".
- Notices (`role="status"`): "Optional questions are unavailable. Generating without them." (the decision service failed) or "Generating without optional questions." (the user skipped).
- Draft area (`ResultBlock`):
  - While generating: the loading label.
  - Empty: "Your cover letter draft will appear here.", with "Add the role context, pick evidence, and generate when ready."
  - With a letter: the line "Review the draft and check every claim before sending it.", the review warning if there is one (in an amber box with `role="status"`), the letter (line breaks kept, scrollable up to 34rem), and the actions group "Draft actions".
  - Actions: **Copy** (status "Cover letter copied to clipboard."), **Export PDF** (label "Exporting PDF..." while it runs; section 3.7), and **Clear**. Clear empties the letter only. The review warning stays in memory until the next generation, and it is hidden while there is no letter.
- Advanced planner trace (collapsible; shown only when the response includes a trace, see section 7).

The letter is read-only on the page. Users copy it or export the PDF. Starting a new generation clears the current letter, warning and trace at once. Once a letter starts, the page offers no way to cancel it, and the loading state is a fixed label. When decisions start preparing, the page scrolls to this section.

### 2.5 Decision panel

When the decision service returns at least two usable questions, the panel replaces the Generate button (the anchor is `#cover-letter-guidance` for cover letters). The employer answer uses the same panel inside its own section. Each question is one step.

- Progress: one bar per question. Screen-reader labels read "Current", "Answered", "Skipped" or "Upcoming", followed by the decision name.
- Counter: "N of M decided".
- Heading: "Decision i of M", followed by " · " and the decision name when one exists.
- Question text. Focus moves here on each step.
- Explanation: the question's `why` text, or "Your choice changes what the draft emphasizes.", then "Select an option only if it is true for you."
- Instruction: "Choose one." (single choice) or "Choose any that apply.", then "You can write your own answer, skip this decision, or go back."
- Options: radio buttons for single choice, checkboxes for multiple choice. Each has a label and an optional detail. The final option is "Write my own answer", which shows a textarea (`maxLength` 500, placeholder "State only what is true for you").
- "Clear this decision" (shown when anything is selected).
- On the last step, if anything is chosen: the heading "These choices will guide the draft" and the chosen answers.
- Validation: "Add your own answer, or clear that choice." when "Write my own answer" is selected but left blank.
- Buttons: **Back** (after the first step); **Continue** (on the last step it reads "Generate with these choices" when something is chosen, or "Generate draft" when nothing is); **Skip this decision**; **Generate without these decisions** (sends no answers); and **Cancel** (hides the panel and returns to the Generate button without cancelling anything).

Behaviour:

- Skipped or unanswered decisions are left out of the draft.
- The options come from the model. The panel asks the user to select only what is true. Selected options are then treated as candidate facts by the writer and by the claim check (section 9).
- The panel is tied to the inputs it was built from. The signature covers the company, job description, employer question, ideal word count, answer style, Advanced Mode, selected evidence indices, manual selection, the manual curation flag and the AI Coaching flag. Editing any of them, including the employer question while cover letter decisions are open, makes submission show "Your inputs changed. Please generate again for updated questions." and close the panel.

### 2.6 Employer answer (`#employer-question`)

A collapsible section with the kicker "Optional", the title "Employer answer" and a meta label: "Optional", "Started" (a question is typed) or "Ready" (an answer exists). It opens when a question, an answer, a length or a style is stored, or when an error or a decision panel needs attention. The intro says: "Use the same evidence selection and Advanced Mode setting, then add the employer's question, a target length, and a preferred answer style."

| Control | Limits | Notes |
|---|---|---|
| Employer question | Textarea, `maxLength` 4000, placeholder "Paste the employer's question here." | Required |
| Length and style (collapsible) | Not applicable | Holds the two fields below |
| Ideal Word Count (optional) | Text, placeholder "e.g. 120" | No client limit. The server rejects more than 100 characters. Free text: it goes into the prompt as typed and is not parsed as a number. |
| Answer Style (optional) | Text, placeholder "e.g. concise, direct, confident" | No client limit. The server rejects more than 300 characters. Free text. |

- Error (`role="alert"`) for this section, for example "Failed to answer employer question".
- Generate Employer Answer (button). It is disabled when the question is empty, the page is busy or manual curation is blocked. The company and job description are not required. Label: "Preparing optional questions…", "Running advanced answer agent..." or "Answering employer question...".
- While decisions are prepared: "Choosing the few decisions that will change this answer…" and "Skip decisions and generate". The panel is the one described in section 2.5.
- Draft area: the empty state "Your employer-question answer will appear here." with "Add the question, choose an optional style, and generate when ready." With an answer: the same review line and warning as the letter, the answer (scrollable up to 22rem), and the actions **Copy** (status "Employer answer copied to clipboard.") and **Clear**. There is no PDF export for the answer.
- Advanced answer trace (collapsible; section 7).

### 2.7 Mobile generate bar

- `MobileGenerateBar` is fixed to the bottom of the screen below the `lg` breakpoint. It shows one hint line and one button.
- It hides while focus is inside an input, textarea or select, so it does not cover the keyboard.
- It only starts the letter flow. The employer answer has to be started from its own section.

The hint and button depend on the first matching state, checked in this order:

| # | Condition | Hint | Button | Action | Enabled |
|---|---|---|---|---|---|
| 1 | Cover letter decisions being prepared | "Choosing the few decisions that will change this letter…" | Skip | Skip decisions and generate | Yes |
| 2 | Cover letter decisions open | "Optional decisions are ready" | Review | Scroll to the decision panel | Yes |
| 3 | Cover letter generating | "Running advanced cover letter agent..." or "Generating cover letter..." | Generating… | None | No |
| 4 | Employer answer preparing or generating | "Choosing the few decisions that will change this answer…", "Running advanced answer agent..." or "Answering employer question..." | Generate | Start cover letter decisions (disabled) | No |
| 5 | Ranking evidence | "Ranking evidence…" | Generate | Disabled | No |
| 6 | Manual curation blocked | "Loading your evidence…", "Profile evidence is unavailable" or "Select at least one item" | Generate | Disabled | No |
| 7 | Company or job description empty | "Add a company and job description" | Generate | Disabled | No |
| 8 | Employer decisions open | "Employer decisions are open" | Generate | Disabled | No |
| 9 | An error is showing | "Check the message above" | Generate | Start cover letter decisions | Yes, when the inputs are valid |
| 10 | Otherwise | "Ready to generate" | Generate | Start cover letter decisions | Yes, when the inputs are valid |

### 2.8 Button rules

| Control | Disabled when |
|---|---|
| Run AI Coaching | The page is busy, or the job description is empty |
| Generate Cover Letter | The page is busy, the company is empty, the job description is empty, or manual curation is blocked |
| Generate Employer Answer | The page is busy, the question is empty, or manual curation is blocked |
| Export PDF | An export is running |

"Busy" means that a letter, an answer, a ranking or a decision request is in progress, or that a decision panel is open. "Manual curation is blocked" means that manual curation is on and the profile is still loading, failed to load, or has no selected item.

### 2.9 Saved draft (browser storage)

- After the first load, every change is written to `localStorage` under `cv-assistant.generate.cover-letter.v3`. This covers the form, the AI Coaching and Advanced Mode settings, the selection and rankings, the letter and answer text, the traces, the warnings, the manual selection, and whether the manual evidence panel is shown. Other collapsible sections are not saved.
- On load the saved state is restored. Unreadable data is ignored and the page starts empty. Storage errors are ignored.
- Nothing is sent to the server for saving, and nothing is encrypted.
- While AI Coaching is on and the job description is not empty, changing the job description, or turning AI Coaching on, clears the stored selection, rankings and traces. It keeps the letter and the answer.

### 2.10 Messages

| Message | Where it shows | When |
|---|---|---|
| Could not rank evidence. Please try again. | Page error | The ranking returned an error with no message |
| Could not rank evidence. Check your connection and try again. | Page error | The ranking request failed |
| Your inputs changed while preparing questions. Please generate again. | Page error | Inputs changed while decisions were being fetched |
| Could not prepare questions. Please try again. | Page error | The decision request returned an error with no message |
| Optional questions are unavailable. Generating without them. | Notice | The decision service was unavailable: a flag from the server, a request failure, or the 60-second client timeout |
| Generating without optional questions. | Notice | The user pressed Skip |
| Your inputs changed. Please generate again for updated questions. | Page error | The decision panel was submitted after the inputs changed |
| Your inputs changed while this draft was being generated; it uses the earlier inputs. | Added to the review warning | Inputs changed while the letter was generating |
| Your saved evidence selection is no longer available. Choose at least one current project or experience, or turn off manual curation. | Page error | The stored selection is empty after it is matched to the current profile |
| Your profile evidence is unavailable. Wait for it to load, or turn off manual curation to use all available evidence. | Page error | Manual curation is on and the profile has not loaded |
| Failed to generate | Page error | The letter request failed with no message |
| Failed to answer employer question | Answer error | The answer request failed with no message |
| Failed to export PDF / Exported PDF is empty | Page error | The export failed or returned an empty file |
| Cover letter copied to clipboard. / Employer answer copied to clipboard. | Copy status | The copy succeeded |
| Clipboard access was blocked. Select and copy the text manually. | Copy status | The copy failed |
| Server messages, shown verbatim: Unauthorized, Missing inputs, Input too long, Invalid evidence selection, Request too large, Generation timed out. Please try again., Unable to load your profile. Please try again. | Page or answer error | The response carried them |

## 3. End-to-end flow

### 3.1 Overview

```text
Job brief (company, job description)
  |
  +-- Run AI Coaching (optional)
  |       POST /api/generate/select              -> up to 6 ranked evidence items
  |
  +-- Generate Cover Letter
          |
          +-- POST /api/generate/clarifications  (kind: cover-letter)
          |       -> 2 to 5 decisions -> decision panel (optional)
          |
          +-- POST /api/generate/cover-letter
                  advancedMode false: standard writer -> claim check -> letter
                  advancedMode true : advanced agent  -> claim check -> letter + trace
                  advanced fails    : standard writer (advancedFallback: true)
```

The employer answer follows the same steps, using `POST /api/generate/clarifications` (kind `employer-question`) and `POST /api/generate/employer-question`.

### 3.2 Evidence selection

1. AI Coaching is on by default, but nothing is ranked until Run AI Coaching is pressed.
2. The page sends only the job description to `POST /api/generate/select`. The server reads the profile itself.
3. The server ranks up to six items with the `hard` model (section 6.3). The page stores the returned indices and rankings.
4. Indices are positions in one combined list: projects first (0 to P-1), then experiences (P to P+E-1).
5. Manual curation replaces the ranked selection. The page builds the indices from the checkboxes: project positions as they are, and experience positions offset by the number of projects.
6. If AI Coaching is on but has not been run, no indices are sent and the writer receives the whole evidence library.

### 3.3 Decisions (optional)

1. The page sends the kind, company, job description, employer question (employer answers only), answer style, ideal word count and indices to `POST /api/generate/clarifications`. The page aborts the request after 60 seconds.
2. The server asks the `easy` model for questions. If fewer than two usable questions come back, it asks once more with an added instruction.
3. Two or more usable questions open the decision panel. Otherwise the page starts the generation at once with no answers. A notice appears only when the server flagged the decision service as unavailable.
4. The user answers or skips. Submitting sends the answers as `clarificationAnswers`.

### 3.4 Standard cover letter (`advancedMode` false)

1. `POST /api/generate/cover-letter` with company, job description, indices (or null), `advancedMode: false` and `clarificationAnswers`.
2. The route validates the input (section 5.4) and loads the profile.
3. Evidence: the selected items in their stored order, or every item when nothing is selected.
4. `buildCoverLetterPrompt` (`src/lib/cover-letter.ts`) builds the prompt. It contains the job description, the company, the contact lines, the evidence block, the confirmed decisions and the writing rules (section 5.1).
5. `generateWithFallback` writes the letter. The `hard` preset is tried first. On failure the route waits 500 ms and tries `hard` again. On failure it uses `easy`. The text is trimmed and otherwise returned unchanged.
6. `checkDraftClaims` checks the letter against the selected evidence (section 4.2). Any warning goes into `reviewWarning`.
7. The response contains `coverLetter`, `reviewWarning` and, when the easy model wrote the text, `fallback: "easy"`.

### 3.5 Advanced Mode cover letter (`advancedMode` true)

`generateAdvancedCoverLetter` (`src/lib/cover-letter-advanced.ts`) uses the `hard` preset for every step.

1. Planner (JSON): audits the job description against the selected evidence, or against the whole library when nothing is selected. It lists requirements with category, priority and coverage.
2. Retrieval, round 1 (JSON): runs only when some requirement is uncovered and not marked "preferred". It proposes up to four supplemental items from the whole library, experiences before projects, excluding items already selected. It may propose none.
3. Final evidence: the selected items plus the supplemental items, de-duplicated and sorted with experiences first, then cut to eight. A selection of more than eight items is cut here as well. Items at the end of the sorted order are dropped, so projects go before experiences, and nothing tells the user.
4. Auditor (JSON): re-checks coverage against the final evidence. Its prompt asks it to be stricter than the writer.
5. Repair retrieval, round 2 (JSON): runs only when a critical requirement is still uncovered. If it proposes items, the supplemental total is capped at six, the final evidence is rebuilt, and the auditor runs again.
6. Synthesiser (JSON): produces a positioning statement, an evidence strategy, transferable signals and caution notes.
7. Writer (text): the standard cover letter prompt plus the planning brief.
8. Reviewer (JSON): scores the draft and lists issues (section 4.3).
9. Revision (text, one pass): runs only when the reviewer did not approve, scored below 88, or listed an issue. The revised text is not reviewed again.
10. Claim check: runs on the final text against the final evidence (section 4.2).
11. Response: `coverLetter`, `advancedTrace`, `indices` (the final evidence positions), `advancedMode: true` and `reviewWarning`. The page then replaces its stored selection with these indices, unless manual curation is on, so later letters reuse the advanced selection.

Retries: each JSON step makes two attempts. A JSON step that still fails returns its fallback value without throwing. For the reviewer, the fallback is approved, score 85, no issues. Each text step (writer and revision) makes up to three attempts: the preset, the same preset again after 500 ms, then `easy`. On the longest path (both retrieval rounds and a revision), the module makes at most 21 model attempts: up to 14 JSON attempts across seven JSON steps (planner, two retrieval rounds, two audits, synthesis and reviewer), up to 6 text attempts (writer and revision), and one claim check. Each attempt can also move through the preset's model list and keys (section 6.2).

Failure: the advanced run gets its own 150-second budget (`ADVANCED_BUDGET_MS`, inside the 240-second request limit). It fails when the writer or the revision fails on every attempt, when the budget runs out, or on another unexpected error. The route then logs the error and runs the standard writer. The response has `advancedFallback: true`, no trace or indices, and a `reviewWarning` that begins "Advanced Mode did not finish, so the standard writer wrote this letter." Only when the whole 240-second limit is reached, or the client disconnects, does the route return 504 or stop. Before this change, Advanced Mode could use the whole 240 seconds and the verification run saw a 504 with no letter. In a verification run with the limits raised on a scratch copy, a full Advanced Mode letter took about 397 seconds, so with the shipped 150-second budget it will normally fall back to the standard writer.

### 3.6 Employer answer

- Standard: `buildEmployerQuestionPrompt`, the same writer chain (`hard`, `hard` after 500 ms, then `easy`), then the claim check. The response contains `answer`.
- Advanced: `generateAdvancedEmployerAnswer`. The planner receives the job description followed by the question. The reviewer also receives the requested word count and style. The response contains `answer`, `advancedTrace` and `indices`.
- Company and job description are optional. Missing values appear in the prompt as "Not provided".

### 3.7 Export PDF

1. The page sends `company` and the displayed letter to `POST /api/generate/cover-letter/pdf`.
2. The server renders the PDF in memory (section 5.5) and returns it.
3. The page turns the response into a blob, creates an object URL, clicks a temporary link named `<company-slug>.pdf` (or `cover-letter.pdf` without a company), and revokes the URL.
4. Errors appear in the page error alert.

### 3.8 Failure and recovery

| Situation | What the user sees | What happens |
|---|---|---|
| Ranking fails on the server | Rankings with the fallback justification | The server returns the first six items, so the page shows them as normal results |
| Decision service fails, or takes over 60 seconds on the client | "Optional questions are unavailable. Generating without them." | The letter starts with no answers |
| Decision service returns fewer than two questions, with no flag | No notice | The letter starts with no answers |
| Decision request returns an error status | The server's message, or "Could not prepare questions. Please try again." | No letter is generated |
| User presses Skip | "Generating without optional questions." | The decision request is aborted, and the letter starts with no answers |
| Standard writer fails on every attempt | "Cover letter generation temporarily unavailable. Please try again." | 502 |
| Writer or revision fails on every attempt in Advanced Mode | A standard letter with no trace | `advancedFallback: true`. The page does not show it. |
| Advanced run passes its 150-second budget | A standard letter, with the warning "Advanced Mode did not finish, so the standard writer wrote this letter." | `advancedFallback: true`. Added after the verification run saw a 504. |
| Whole request reaches 240 seconds | "Generation timed out. Please try again." | 504. No fallback. |
| Claim check fails or times out | "We could not complete the evidence check. Please review all personal claims before submitting." | The letter is still returned |
| Inputs change during generation | The letter, with "Your inputs changed while this draft was being generated; it uses the earlier inputs." | The response is applied to the page |
| A stored evidence index no longer exists | "Invalid evidence selection" | 400 |
| The page is left while a ranking or decision request runs | Nothing is shown | The client aborts the request |

## 4. Grounding and claim-check guards

Four layers apply on `/generate`. None of them blocks a letter. Only the advanced revision edits the text, and that edit is guided by the reviewer's findings.

### 4.1 Layer 1: prompt rules

The writer and answer prompts (section 5) tell the model to use only supplied evidence and confirmed decisions, not to invent facts, and to describe adjacent skills as adjacent. The code does not check these rules directly. Layers 2 and 3 are the only checks on the output.

### 4.2 Layer 2: claim check (`checkDraftClaims`, `src/lib/generate/claim-check.ts`)

Runs after every letter and answer on `/generate`, standard or advanced, inside the route's try block.

- Input: the candidate's name, the draft, the evidence used for that draft (title, type, summary and description only) and the confirmed decisions as text. For standard letters the evidence is the selected items. For advanced runs it is the final evidence.
- Model: `generateJsonSafe('easy', prompt, 0, signal)`. One attempt, no retry.
- Timeout: 18,000 ms (`CHECK_TIMEOUT_MS`), on its own AbortController.
- Rules in the prompt: only the evidence and the confirmed decisions establish facts. Candidate-specific facts count, including actions, achievements, responsibilities, skills, qualifications, eligibility, motivations, personal circumstances and specific details. A related skill does not prove direct experience. A general achievement does not prove a particular process or outcome. Greetings, courtesy, role names and statements of interest are ignored. Facts must not be assumed from the job description, the title or convention. The reply is JSON, of the form `{"supported": true, "issues": []}`.

Outcome:

| Model result | `reviewWarning` returned |
|---|---|
| Not an object, `supported` is not a boolean, or `issues` is not an array | "We could not complete the evidence check. Please review all personal claims before submitting." |
| `supported` is true and there are no issues | None |
| Any issues, even when `supported` is true | "Please check these potentially unsupported claims against your own experience: `<issue>`; `<issue>`." |
| `supported` is false and there are no issues | "Some claims could not be verified against your supplied evidence. Please review the draft before submitting." |
| Error, or the 18-second timeout (not caused by the caller) | "We could not complete the evidence check. Please review all personal claims before submitting." |
| Caller cancelled | The error is rethrown. The route returns 504 or nothing, depending on which signal fired. |
| Signal already aborted when called | Throws "Generation cancelled" |

Issue cleaning: strings only; whitespace collapsed; trimmed; cut to 200 characters; trailing full stops, question marks and exclamation marks removed; empty entries dropped; at most three kept.

The warning appears above the letter with `role="status"`. It is advisory. The user decides what to do with it.

Recorded weakness: `docs/auto-apply-quality-metrics.md` records that the same check, run on Auto Apply letters, sometimes lists internal notes as claims (for example "Candidate clarification answers are empty..."), and that the text needs cleaning before it reaches the applicant. This module does not clean it.

### 4.3 Layer 3: advanced reviewer and revision (`src/lib/cover-letter-advanced.ts`)

- Reviewer (JSON, `hard` preset, two attempts). It returns `approved`, `score` (clamped to 0 to 100, and 75 when not a number), `issues`, `missingRoleSignals` and `revisionInstructions`.
- Reviewer criteria, summarised from the prompt: the opening names the role and the strongest supported proof, or gives the direct answer; confirmed decisions for lead proof, example and emphasis are followed; job wording is used only where the evidence supports it, and no phrase appears more than twice; every claim is supported, without upgraded scope, seniority, outcomes or motivation; stock phrases such as "I am excited", "passionate" and "Great question" are removed. The prompt also sets score rules. A failing opening must score below 70 and be unapproved. An unsupported eligibility or factual answer must be unapproved. An omitted unsupported requirement must not lower the score. Claiming that requirement, a stock opening or padding does.
- Revision trigger: `!approved || score < 88 || issues.length > 0`.
- Reviewer failure: the fallback is `approved: true, score: 85, issues: []`. Because 85 is below 88, a revision still runs, with no findings to act on.
- Revision (text, one pass): replaces the draft. It is not reviewed again.

### 4.4 Layer 4: dash sanitiser (advanced only)

`sanitizeOutput` in `cover-letter-advanced.ts` trims the text and replaces each em dash and en dash with a comma. It runs on every advanced text output: the draft, the revision and the employer answer. The replacement adds no space. An em dash placed directly between two words therefore becomes a comma with no space, and a dash with spaces around it leaves a space before the comma. The standard path has no sanitiser. Its prompts ask the model to avoid dashes, and nothing checks the result.

### 4.5 What `/generate` does not check

- None of the deterministic guards in `src/lib/cover-letter-service.ts` (section 4.6) run on `/generate`. There is no lexicon, figure, employer-name, echo or structure check.
- No word-count check, and no check of the greeting, sign-off or paragraphs.
- No removal of unsupported sentences.
- No code-fence stripping. The standard path returns trimmed text, and the advanced path returns sanitised text. The Auto Apply chain strips a leading or trailing code fence, but this module does not.
- No check that an answer respects the requested word count.
- No check that the writer followed the confirmed decisions.

### 4.6 Deterministic guards used by Auto Apply (`src/lib/cover-letter-service.ts`)

These run inside `runCoverLetterAgent`. Its callers are `src/app/api/auto-apply/job/[jobId]/cover-letter/route.ts` and `src/lib/auto-apply/prepare.ts`. The eval runner (`evals/run-letter.ts`) and `tests/auto-apply/run-tests.ts` also import them. No `/generate` route calls them. The two defect checks and the repair rule marked "(working copy only)" are uncommitted changes. Appendix A describes them.

Constants:

| Name | Value | Use |
|---|---|---|
| `TARGET_MIN_WORDS` | 170 | Minimum length gate, and the "too short" defect |
| `MODEL_CALL_TIMEOUT_MS` | 40,000 ms | Timeout for each call in `generateLetterText` |
| `MAX_EXTRA_ATTEMPTS` | 1 | Extra model tries once a well-formed letter exists |
| `COVER_LETTER_MODELS` | `nvidia/nemotron-3-ultra-550b-a55b`, `poolside/laguna-xs-2.1`, `deepseek-ai/deepseek-v4.1-flash` | Tried in turn, each pinned with `modelOverride` |
| `GROUNDING_MODELS` | `nvidia/nemotron-3-ultra-550b-a55b`, `deepseek-ai/deepseek-v4.1-flash` | The grounding editor |
| `GROUNDING_CALL_TIMEOUT_MS` | 40,000 ms | Timeout for each grounding call |
| Evidence limit | 5 | Default in `selectEvidenceForJob` |

Functions:

- `isWellFormedLetter(text)`: at least 80 words, and at least `max(2, floor(words / 60))` commas.
- `generateLetterText(prompt, signal, options)`: calls each model in turn through `getModel("easy")` with `modelOverride`, removes a leading or trailing code fence, and returns the first letter that is well formed and at least 170 words. Otherwise it returns the best letter seen: well formed beats malformed, and longer beats shorter. Once a well-formed letter exists, at most one more model is tried. It throws "No model produced a cover letter" when nothing usable comes back.
- `selectEvidenceForJob(items, jobText, signal, limit = 5)`: returns everything when there are five or fewer items. Otherwise it asks the `easy` model to rank them, with a 20-second timeout and no retry. It accepts the result when at least two picks come back, capped at five. Otherwise it ranks by keyword overlap with the job text.

The agent works from a job text made of the title, the company and the first 6,000 characters of the job description (`jobText` in `runCoverLetterAgent`). The ranking prompt in `selectEvidenceForJob` receives the first 6,000 characters of that text.

`findUnsupportedClaims(text, profile, company, jobDescription, title)` returns the claims the letter makes that the profile does not support. "The profile" means the JSON of the whole profile, lowercased.

1. Employment at the company: a sentence such as "at, with, for or joined `<company>`, I `<verb>`" when the company is not in the profile.
2. Years of experience ("N years", "N+ years", number words) that the profile does not contain.
3. Figures the profile does not contain: percentages, "k", "x", "million", "billion", durations such as "3 weeks", and "sub-second", "millions", "billions" or "thousands".
4. A project described as an employer ("at `<project name>`").
5. Claimed history with the employer ("your recent...", "co-developed your...", "highlighted in your...", "foundation for your...", "powering X's...").
6. Echoes: seven consecutive words that appear in the job description and not in the profile. A run is ignored when every one of its words appears in the title, the company or the phrase "I am applying for the role at". The check is skipped when no job description is passed, as the eval does.
7. Terms from a fixed lexicon (for example Kubernetes, Terraform, OAuth, Databricks, PhD, MBA, PMP, CISSP) that appear in the letter but not in the profile.

`findLetterDefects(text, candidateName, company, title)` returns defect strings:

- "too short" (fewer than 170 words).
- "is one block of text; use short paragraphs" (fewer than two paragraphs of more than 25 words).
- "contains a broken sentence fragment" (a line starts with a lowercase letter or a digit and has more than three words).
- "talks about meeting the posting's requirements instead of showing experience" (phrases such as "essential requirement" or "meeting the ... requirement").
- "contains a garbled run-on title opening" (the title is followed by a hyphen and " I " within the first 600 characters after the first line).
- "ends with a chat-style line instead of a closing sentence" (a line starts with "Let me know", "Feel free", "Happy to", "Let's discuss" or "Thank you for your" or "Thank you for considering").
- "opens with a job title run into a sentence (a dash after the title)".
- "repeats the job title as a bare sentence".
- "too long: keep it under 350 words, one letter only" (triggered above 400 words; see section 11).
- "calls the applicant a 'candidate'" and "refers to the applicant as 'candidate'".
- "is missing punctuation (commas)" (the letter is not well formed).
- "opens with 'In this role' instead of naming the role and company".
- "truncated link" (the last line is a fragment such as "com" or "au").
- "does not open with a greeting such as 'Dear Hiring Manager,'" (the first word is not dear, hello, hi, to the or greetings).
- "has no sign-off with the applicant's name" (the last line has more than six words and is not a sign-off).
- "never names `<company>`" and "never names the `<title>` role".
- "uses stock filler ("<phrase>") instead of specific experience" (working copy only). The phrases are "I am" followed by an optional "so" or "very" and then "excited", "thrilled", "delighted" or "passionate", plus "what sets me apart", "proven ability", "proven track record", "deep expertise", "cutting-edge" and "bridge the gap".
- "says 'in the same organization' and so credits a separate project to an employer" (working copy only).

`stripUnsupportedSentences(text, terms, company)` removes each sentence that matches a term. It returns null when fewer than 120 words remain, and the caller then keeps the original text.

`repairLetterStructure(text, candidateName, company, title)` applies deterministic fixes:

- Replaces "My CV shows that I", and the resume, profile, demonstrates and indicates variants, with "I" anywhere in the letter.
- (Working copy only.) Replaces "In the same organization, I", and the company, team and role variants, with "I also".
- Puts the greeting on its own line, and adds "Dear Hiring Manager," when there is no greeting.
- Rewrites a title run into the first sentence as "I am applying for the `<title>` role at `<company>`.", and inserts that sentence when the opening lacks the title or the company, unless the first 300 characters already contain "apply" or "applying".
- Turns a name run onto the last sentence into "Sincerely," followed by the name.
- Drops chat-style closers (unless the block has more than 40 words) and keeps one of two consecutive closing sentences.
- Removes contact details from body sentences.
- Adds "I would welcome the opportunity to discuss how my experience fits the `<title>` role at `<company>`." when the last body paragraph has no closing sentence.
- Appends "Sincerely," and the name when the last lines contain neither the candidate's surname nor a sign-off word.

`runCoverLetterAgent(args)` pipeline:

1. Select evidence with `selectEvidenceForJob`.
2. If `advanced` is set, run the advanced agent with preset `easy` and a time budget (`advancedBudgetMs`, default 150,000 ms). On any error other than caller cancellation, fall back to the standard writer and set `fallbackNote` to "The advanced agent ran out of time, so the standard cover letter agent wrote this letter." The note says "ran out of time" for every error.
3. Otherwise, or after the fallback, write with `generateLetterText` and the standard prompt.
4. Deterministic retry: up to two rounds, while under 50 seconds and issues remain. Each round asks for a rewrite that removes the listed terms and fixes the listed defects. The new letter is kept only when it has fewer issues.
5. Grounding editor: up to two rounds with `GROUNDING_MODELS`. The second round runs only when under 35 seconds with issues left. A rewrite is kept only when it is well formed, has 170 to 400 words, and has no more issues.
6. Remove any remaining unsupported sentences.
7. Keep the latest claim-clean letter of at least 170 words that is well formed.
8. Independent verifier (under 85 seconds): the `hard` model lists sentences that the CV does not support, that copy the posting, or that use the title as experience. Those sentences are removed when at least 170 words and a well-formed letter remain.
9. Expansion (under 100 seconds, and only while the letter is still under 170 words): asks for 220 to 300 words. The result is kept only when it is well formed, longer, at most 380 words and free of unsupported terms.
10. If the letter is still under 170 words, restore the copy from step 7.
11. Apply `repairLetterStructure`, and remove a trailing domain fragment.
12. Final checks. Remaining unsupported terms become the warning "Check these before sending, they are not in your profile: `<terms>`." The model claim check then runs against all profile items, not only the selected ones, and its concrete findings are added to the warning.

The returned `unsupportedClaims` list holds the remaining terms, the leftover defects (prefixed "the letter") and any concrete model finding. Model failures in these steps are swallowed unless the caller cancelled.

### 4.7 Failure outcomes

| Check | Failure | Result |
|---|---|---|
| Claim check on `/generate` | Timeout, error or malformed reply | Advisory warning; letter returned |
| Reviewer (advanced) | Error | The fallback score of 85 causes a revision with no findings |
| Advanced writer or revision | Fails on every attempt | Standard letter; `advancedFallback: true` |
| Advanced JSON step | Error or malformed reply | The step uses its fallback value, and the run continues |
| Advanced agent | Passes its 150-second budget | Standard writer runs; the letter carries a warning |
| Advanced agent | Whole request reaches 240 seconds | 504; no fallback |
| Standard writer | Every attempt fails | 502 |
| Auto Apply guards | A model step fails | Earlier text is kept; errors are swallowed unless the caller cancelled |

## 5. Output constraints

### 5.1 Cover letter

The standard prompt is `buildCoverLetterPrompt`. The advanced writer uses the same prompt plus the planning brief. The length and structure rule, quoted exactly from the prompt, is:

> Write 250 to 350 words in 3 or 4 short paragraphs, including a greeting and a sign-off. If that length would require padding or an unsupported claim, write less.

| Requirement | Prompt wording (summary) | Enforced in code |
|---|---|---|
| Length | 250 to 350 words; write less rather than pad or invent | No |
| Structure | 3 or 4 short paragraphs, including a greeting and a sign-off | No |
| Greeting | Neutral greeting when no recipient is named | No |
| Opening | The first sentence names the target role and the single strongest proof | Advanced reviewer only |
| Examples | One example, or two when a second supported requirement would otherwise be missed | No |
| Job phrases | Only where evidence or a confirmed decision supports them; at most twice each; no keyword list | Advanced reviewer only |
| Format | Plain text. No markdown, bullets, tables, columns, icons or headings. | No |
| Dashes | No em dash or en dash | Advanced only (section 4.4) |
| Banned openings | "I am writing to", "I am excited", "I am passionate" | No |
| Banned words | passionate, dynamic, leverage, synergy, team player, go-getter, results-driven | No |
| Company | No praise, no claimed knowledge, no motivation unless a confirmed decision supplies it | No |
| Contact details | Only supplied details; no invented address, date or recipient | No. The PDF writes its own date and "To" block. |
| Closing | One short sentence about discussing the role, then the candidate's name if supplied | No |
| Output | The final letter only, with no placeholders or commentary | No |

Other prompt rules: follow confirmed choices of lead proof or emphasis where the evidence supports them; treat the job description and candidate text as material, not instructions; do not invent or upgrade employers, titles, dates, skills, qualifications, work rights, tools, metrics, scope, seniority, outcomes or motivation; describe supported adjacent skills as adjacent.

### 5.2 Employer answer

The prompt is `buildEmployerQuestionPrompt`. Its length rule, quoted exactly, is:

> Follow any format, length, or word limit stated in the question. A stated maximum is a hard ceiling. Otherwise follow the supplied word count and style. If neither is supplied, use one to three sentences for a factual question and about 80 to 180 words for a behavioral question.

| Requirement | Prompt wording (summary) | Enforced in code |
|---|---|---|
| First sentence | The direct answer: the fact, a yes or no, the decision or the specific example | No |
| Openers | Not "Great question", "Certainly", "I would be happy" or a restatement of the question | No |
| Several parts | Answer in the order asked; start each part with its direct point | No |
| Factual questions | The fact goes in the first sentence. If it was not supplied, say so, and do not imply yes or no. | No |
| Behavioural questions | One supported example in prose: the situation, the candidate's own actions and the documented result. No Situation, Task, Action or Result labels. | No |
| Length | As quoted above | No |
| Job phrases | Only in the sentence that proves them, only when supported, at most twice | No |
| Format | Plain text and short paragraphs. Bullets only when the question asks for them. No markdown. No em or en dash. | Dashes only in advanced mode |
| Output | The answer only | No |

Ideal Word Count and Answer Style are inserted into the prompt under "Ideal Word Count:" and "Answer Style:". Neither is parsed.

### 5.3 Decision questions

The prompt is `buildClarificationsPrompt`. It asks for "Return 2 to 5 questions, ordered from the decision with the largest effect on the draft to the smallest. If two genuine decisions do not exist, return {"questions":[]}." It also asks for "2 to 5 options" per question. The normaliser (`normalizeClarificationQuestions`) enforces the limits below in code.

| Rule | Limit |
|---|---|
| Questions per set | 2 to 5. Fewer than two usable questions returns an empty set. |
| Options per question | 2 to 5 after filtering. A question with fewer than two options is dropped. |
| Question type | "single" or "multiple". Other values are dropped. |
| Duplicates | Questions are de-duplicated by prompt text (case-insensitive). Options are de-duplicated by label (case-insensitive). |
| Filler options | Removed: other, something else, none of the above or these, prefer not to say, not sure, unsure, n/a, skip, all of the above, no preference |
| Prompt text | 220 characters, with "?" added if missing |
| Decision label | 48 characters |
| "Why" text | 180 characters |
| Option label | 160 characters |
| Option detail | 140 characters |
| IDs | Questions `q1` to `q5` and options `o1` to `o5`, assigned by the server |

Forks offered by the prompt:

- Cover letter: lead proof (single choice; labels must be supplied evidence titles), requirements to mirror (multiple choice; the job's own wording), positioning (single choice; angles the evidence can support), and a missing personal fact (single or multiple; broad categories that must not claim the candidate holds them). Forks that are not open are omitted.
- Employer answer: a factual, eligibility, availability, location, work-rights or pay question (ask for the missing fact in broad choices); a behavioural question (which evidence to use, then which aspect to stress); a multi-part question (which part leads, only when the order is not already set); and lead proof, only when the question needs an example.

Prompt inputs: the first 12 evidence items (summary capped at 1,200 characters, description at 1,600), the job description (up to 18,000 characters) and the employer question (up to 4,000). Word count and style are listed as "already known", so the model does not ask about them.

Confirmed answers are stored as the question text plus the chosen labels (or the custom text). The server keeps at most five decisions with five answers each. Answer text is capped at 500 characters and questions at 280. The writer receives them under "Candidate-confirmed decisions", with the statement that chosen answers are facts or preferences, and that unselected options are not facts.

### 5.4 Input and evidence limits

| Item | Limit | Enforced by | Failure |
|---|---|---|---|
| Company name | 300 characters | Client `maxLength`; server | 400 "Input too long" |
| Job description | 18,000 characters | Client `maxLength`; server (not on `/select`) | 400 "Input too long" |
| Employer question | 4,000 characters | Client `maxLength`; server | 400 "Input too long" |
| Ideal Word Count | 100 characters | Server. The decisions route cuts it; the answer route rejects it. | Answer route: 400 "Input too long" |
| Answer Style | 300 characters | Server. The decisions route cuts it; the answer route rejects it. | Answer route: 400 "Input too long" |
| Custom decision answer | 500 characters | Client `maxLength`; server cuts it | None |
| Evidence indices | At most 30 non-negative safe integers. Each must exist in the profile (letter and answer routes). An empty array means all items. | Server | 400 "Invalid evidence selection" |
| Request body | Content-Length header of at most 100,000 bytes (decisions, letter and answer routes; not `/select` or the PDF route) | Server | 413 "Request too large" |
| AI Coaching results | Up to 6 items | Server | None |
| Advanced final evidence | Up to 8 items, of which at most 6 are supplemental | `cover-letter-advanced.ts` | None |
| Decision questions returned | 2 to 5 | Normaliser | Fewer than 2: no panel |

The standard writer sends every selected evidence item in full, with its summary and description. The prompt has no cap on the total size of the profile text. Only the request body is size-checked.

### 5.5 PDF output (`src/app/api/generate/cover-letter/pdf/route.ts`)

- Page size: 612 by 792 points (US Letter), set by `PAGE_WIDTH` and `PAGE_HEIGHT`.
- Size target: 512 KB (`MAX_PDF_BYTES` = 524,288 bytes). The route tries the three presets in order and returns the first one within the target. If none is within it, the smallest is returned with `X-CV-Assistant-Within-512KB: false`. Nothing is rejected for size.

| Preset | Fonts | Body size | Justified | Page furniture |
|---|---|---|---|---|
| `premium` | Noto Sans, embedded (subset) | 10.9 pt | Yes | Yes: top bar, bottom accent, footer rule and "Page N" |
| `compact` | Helvetica when every character is in Latin-1, otherwise Noto Sans | 10.15 pt | No | Yes |
| `micro` | As `compact` | 9.65 pt | No | No |

- Layout: the candidate name (profile name or "Candidate") in bold; a "COVER LETTER" tag at the top right; contact lines (phone and email; website and LinkedIn with the protocol removed; "Languages: ..."); a rule; and an information panel with the labels "Date" (the export date in en-AU long format, Australia/Melbourne time zone) and "To" ("Hiring Team" with the company, or "Target Company").
- Body: the paragraphs extracted from the letter (section 6.7).
- Metadata: title `<company or Candidate> Cover Letter`; author the profile name or "CV Assistant"; subject "Cover Letter"; creator and producer "CV Assistant".
- Filename in the response header: `<company-slug>-cover-letter.pdf`, or `cover-letter.pdf` without a company. The page saves `<company-slug>.pdf` (or `cover-letter.pdf`), because the browser uses the name the page gives the blob download.

## 6. API reference

### 6.1 Shared behaviour

| Topic | Behaviour |
|---|---|
| Authentication | Each route calls `getAuthFromCookies` (`src/lib/auth.ts`). It reads the `auth_token` cookie and verifies it with `JWT_SECRET`. A missing, invalid or expired token returns `401 {"error":"Unauthorized"}`. A missing `JWT_SECRET` also returns 401 for every request, because the check runs inside the verification try block. Tokens last seven days. |
| Request body | JSON, read with `req.json()`. Send `Content-Type: application/json`. |
| Response body | JSON, except the PDF route, which returns `application/pdf`. |
| Handled errors | `{ "error": "<message>" }`, with the status listed for each route. Unhandled exceptions return the framework's 500. |
| Streaming | Nothing is streamed to the browser. Model output is requested as a stream upstream (`stream: true`) and assembled in `src/lib/ai.ts` before the route answers. The page shows a loading state until the full response arrives. |
| Client disconnect | Routes use `req.signal`. When the client disconnects, the route rethrows the abort reason, so the framework's default error response goes to a client that has already gone. |
| Runtime | Default Node.js runtime. No route exports `runtime`. |
| `maxDuration` | `src/app/api/generate/cover-letter/route.ts` exports `maxDuration = 300`. No other route in `src/app/api/generate` or `src/app/generate` does. Three Auto Apply routes also export `maxDuration = 300`: the cover-letter, prepare and session run routes. `vercel.json` has no `functions` block. The limits in force are the in-route timeouts below and the model deadlines in section 6.2. |
| In-route timeouts | Select: none. Decisions: 50 seconds. Letter and answer: 240 seconds. PDF: none. |
| Logging | Most failures are written to the server log with `console.error`. The select route does not log. |

### 6.2 Models, keys and timeouts (`src/lib/ai.ts`)

- Presets: `easy`, `hard` and `document`. The module uses `easy` and `hard`.
- Default model lists:
  - `easy`: `poolside/laguna-xs-2.1`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-ultra-550b-a55b`
  - `hard`: `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-ai/deepseek-v4.1-flash`
- Overrides: `NVIDIA_NIM_EASY_MODELS` and `NVIDIA_NIM_HARD_MODELS` (comma-separated).
- Keys: `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9`. Duplicate values count as one key.
- Keys and rounds: a call runs in rounds, up to the number of configured keys. In each round, every model is tried once, with the least busy key that has not yet been tried for that model and is not cooling down. An empty response, a stream that ends before completion, or a response that does not finish with `stop` counts as a failure. HTTP 401 or 402 disables that key for at least five minutes. HTTP 403, 404, 429, 5xx and network failures put that model and key into a cooldown that doubles on repeat failures (base 3 seconds, or 10 seconds for 429), capped at 60 seconds. A `Retry-After` header is honoured. Other 4xx responses reject that model for the rest of the call.
- Deadlines: each call has `NVIDIA_NIM_TIMEOUT_S` in total (default 240). The first token must arrive within `NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S` (default 20; 75 for `deepseek-ai/deepseek-v4.1-flash`; 55 for `stepfun-ai/step-5-preview`). Gaps between chunks may last up to `NVIDIA_NIM_IDLE_TIMEOUT_S` (default 90).
- Output limit: `max_tokens` is the lower of `NVIDIA_NIM_MAX_TOKENS` (default 65,536) and a per-model cap: 16,384 for `poolside/laguna-xs-2.1`, 65,536 for `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, and 32,768 for other models. DeepSeek and StepFun models have a cap of 1,048,576, so the environment value applies to them.
- Base URL: `NVIDIA_NIM_BASE_URL` (default `https://integrate.api.nvidia.com/v1`).
- `modelOverride` pins one model for one call. The `/generate` routes do not use it. The Auto Apply chain does.
- JSON helper `generateJsonSafe(preset, prompt, maxRetries = 2, signal)`: takes the text from the first `{` to the last `}`, parses it, and retries on error, making `maxRetries + 1` attempts.

Attempts per caller:

| Caller | Format | Attempts |
|---|---|---|
| Ranking (`/select`) | JSON, `hard`, one retry | 2 |
| Decisions (`/clarifications`) | JSON, `easy`, one retry. A second request (no retry) when fewer than two questions come back. | Up to 3 |
| Standard writer (letter and answer) | Text: `hard`, `hard` after 500 ms, then `easy` | Up to 3 |
| Advanced JSON steps | JSON, preset `hard`, one retry | 2 each |
| Advanced text steps (writer, revision) | Text: the preset, the same preset after 500 ms, then `easy` | Up to 3 each |
| Claim check | JSON, `easy`, no retry, 18-second timeout | 1 |

Each attempt can also move through the preset's model list and keys, so the number of upstream requests can be higher than the attempt count.

### 6.3 POST /api/generate/select

Purpose: rank the user's evidence against a job (AI Coaching).

Request body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `jobDescription` | string | Yes | Truthy check only. The server does not trim it or limit its length. |

Responses:

| Status | Body | When |
|---|---|---|
| 200 | `{ "indices": number[], "items": CoverLetterItem[], "rankings": Ranking[] }` | A normal ranking, or the fallback |
| 200 | `{ "indices": [], "items": [], "rankings": [] }` | No projects or experiences. No model call is made. |
| 400 | `{ "error": "Missing jobDescription" }` | The field is empty or missing |
| 401 | `{ "error": "Unauthorized" }` | Not signed in |
| 500 | Framework default | Malformed JSON, or a database error (these calls are outside the try block) |

`Ranking` is `{ index, type: "project" | "experience", title, summary, justification }`. There are up to six, in rank order.

Processing:

1. Load the profile and build the items with `getCoverLetterItems`.
2. Ask the `hard` model for a ranking (`buildExperienceRankingPrompt`). It returns JSON `{"rankings":[{"index","title","justification"}]}` with up to six items, and it forbids invented numbers.
3. Keep only entries whose index is an existing integer that has not been seen before. Use the model's justification when it is non-empty, otherwise `<title> aligns with the role based on the candidate data provided.`. Keep at most six.
4. If the model fails or returns nothing usable, return the first six items with the justification "Fallback ranking applied because AI coaching could not confidently reorder this evidence."

Notes:

- The `items` array, which holds the full evidence including summaries and descriptions, is returned. The page does not use it.
- The route has no timeout of its own and does not pass `req.signal` to the model. A ranking the user cancelled still runs to completion on the server.
- The job description is not length-limited on the server.

### 6.4 POST /api/generate/clarifications

Purpose: propose two to five decisions that change the draft.

Request body:

| Field | Type | Notes |
|---|---|---|
| `kind` | `"cover-letter"` or `"employer-question"` | Required |
| `company` | string | Required for cover letters. Trimmed. Over 300 characters is rejected. |
| `jobDescription` | string | Required for cover letters. Trimmed. Over 18,000 characters is rejected. |
| `question` | string | Required for employer questions. Trimmed. Over 4,000 characters is rejected. |
| `answerStyle` | string | Trimmed and cut to 300 characters |
| `idealWordCount` | string | Trimmed and cut to 100 characters |
| `indices` | number[] or null | Non-integer and negative entries are dropped. The first 30 entries are used. Entries outside the profile are ignored; if none remain, all items are used. |

Checks, in order:

1. Content-Length over 100,000 bytes: `413 {"error":"Request too large"}`.
2. Company over 300, job description over 18,000 or question over 4,000 characters: `400 {"error":"Input too long"}`.
3. Unknown `kind`, a cover letter without a company or job description, or an employer question without a question: `400 {"error":"Missing inputs"}`.

Responses:

| Status | Body | When |
|---|---|---|
| 200 | `{ "questions": ClarificationQuestion[] }` | A normal result. It may hold fewer than two questions. |
| 200 | `{ "questions": [], "unavailable": true }` | A model, parsing or 50-second timeout failure, including a failure on the second request |
| 401 | Unauthorized | Not signed in |

`ClarificationQuestion` is `{ id: "q1" to "q5", decision, prompt, why, type: "single" | "multiple", options: [{ id: "o1" to "o5", label, detail }] }`.

Processing: a 50-second limit, combined with `req.signal`; the `easy` model; a second request with an added instruction when fewer than two questions come back. The route does not return a 5xx for model failures.

Client behaviour: the page aborts the request after 60 seconds. An abort, the `unavailable` flag or a failed request all lead to generation without answers and to the "unavailable" notice.

### 6.5 POST /api/generate/cover-letter

Purpose: write a cover letter, standard or Advanced Mode.

Request body:

| Field | Type | Notes |
|---|---|---|
| `company` | string | Required. Trimmed; at most 300 characters. |
| `jobDescription` | string | Required. Trimmed; at most 18,000 characters. |
| `indices` | number[] or null | Optional. At most 30 entries, each a non-negative safe integer that exists in the profile. |
| `advancedMode` | boolean | Coerced with `Boolean()` |
| `clarificationAnswers` | `{ question: string, answers: string[] }[]` | Optional. The first five entries are used. Questions are cut to 280 characters, and each entry keeps up to five answers of up to 500 characters. Invalid entries are dropped. |

Checks, in order:

1. Authentication.
2. Content-Length over 100,000 bytes: `413`.
3. `validateGenerationInput`: `Missing inputs`, `Input too long` and `Invalid evidence selection`, all `400`.
4. Profile load failure: `504` "Generation timed out. Please try again." when the 240-second signal has fired, otherwise `503` "Unable to load your profile. Please try again.".
5. An index at or beyond the number of profile items: `400` "Invalid evidence selection".

Processing: a combined 240-second signal (`req.signal` plus a timeout). The advanced branch runs when `advancedMode` is true, with an additional 150-second budget. If it fails for any reason other than the overall time limit or a disconnect (including its own budget), the standard branch runs.

Responses:

| Status | Body | When |
|---|---|---|
| 200 (advanced) | `{ "coverLetter", "advancedTrace", "indices", "advancedMode": true, "reviewWarning"? }` | The advanced run succeeded |
| 200 (standard) | `{ "coverLetter", "reviewWarning"?, "fallback"?: "easy", "advancedFallback"?: true }` | The standard run succeeded. `advancedFallback` is set when Advanced Mode was requested. |
| 400 | `{ "error" }` | Validation (see above) |
| 401 | `{ "error": "Unauthorized" }` | Not signed in |
| 413 | `{ "error": "Request too large" }` | Body too large |
| 502 | `{ "error": "Cover letter generation temporarily unavailable. Please try again." }` | The standard writer failed on every attempt |
| 503 | `{ "error": "Unable to load your profile. Please try again." }` | The profile load failed |
| 504 | `{ "error": "Generation timed out. Please try again." }` | The 240-second signal fired during generation |

Optional fields are omitted when they have no value, because JSON drops `undefined`.

Illustrative shape of an advanced response. The values are placeholders, not real output:

```json
{
  "coverLetter": "Dear Hiring Manager,\n\nI am applying for the ...",
  "advancedTrace": { "mode": "advanced", "roleFocus": "...", "finalEvidenceCount": 5, "coverageSummary": ["<requirement> (gap)"] },
  "indices": [0, 2, 4, 5, 7],
  "advancedMode": true
}
```

### 6.6 POST /api/generate/employer-question

Purpose: answer one employer question, standard or Advanced Mode.

Request body:

| Field | Type | Notes |
|---|---|---|
| `question` | string | Required. Trimmed; at most 4,000 characters. |
| `company` | string | Optional. At most 300 characters. |
| `jobDescription` | string | Optional. At most 18,000 characters. |
| `idealWordCount` | string | Optional. Over 100 characters is rejected. |
| `answerStyle` | string | Optional. Over 300 characters is rejected. |
| `indices`, `advancedMode`, `clarificationAnswers` | Various | As in section 6.5 |

Checks: authentication; Content-Length (`413`); `validateGenerationInput` (`Missing question`, `Input too long` and `Invalid evidence selection`, all `400`); profile load (`503` or `504`); an index beyond the profile returns `400` "Invalid evidence selection".

Responses:

| Status | Body | When |
|---|---|---|
| 200 (advanced) | `{ "answer", "advancedTrace", "indices", "advancedMode": true, "reviewWarning"? }` | The advanced run succeeded |
| 200 (standard) | `{ "answer", "reviewWarning"?, "fallback"?: "easy", "advancedFallback"?: true }` | The standard run succeeded |
| 400 | `{ "error": "Missing question" }`, `Input too long` or `Invalid evidence selection` | Validation |
| 401 | Unauthorized | Not signed in |
| 413 | `{ "error": "Request too large" }` | Body too large |
| 502 | `{ "error": "Employer question answer generation temporarily unavailable. Please try again." }` | The standard writer failed |
| 503, 504 | As section 6.5 | |

Differences from the letter route: the company and job description are optional, and oversized word-count and style values are rejected rather than cut.

### 6.7 POST /api/generate/cover-letter/pdf

Purpose: render the letter as a PDF.

Request body:

| Field | Type | Notes |
|---|---|---|
| `coverLetter` | string | Required. Trimmed. |
| `company` | string | Optional. Trimmed. Used in the title, the filename and the "To" block. |

Responses:

| Status | Body | When |
|---|---|---|
| 200 | PDF bytes | Rendered |
| 400 | `{ "error": "Missing coverLetter" }` | The letter is empty |
| 401 | Unauthorized | Not signed in |
| 500 | Framework default | Malformed JSON, or a database error. No try block covers either. |

Response headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="<company-slug>-cover-letter.pdf"`, or `cover-letter.pdf` without a company |
| `X-CV-Assistant-PDF-Size` | The size in bytes |
| `X-CV-Assistant-Compressed` | `false` only when the premium preset is returned within the limit. Any other result sends `true`, including the over-limit fallback. |
| `X-CV-Assistant-PDF-Preset` | `premium`, `compact` or `micro` |
| `X-CV-Assistant-Within-512KB` | `true` or `false` |

Processing:

1. Load the profile and read the contact details (name, phone, email or work email, website, LinkedIn and languages).
2. Extract the paragraphs:
   - Split on blank lines, trim the lines, and drop empty blocks.
   - Drop the first block when it looks like a header. It counts as a header when one of its lines equals the candidate's name, or contains a contact value, or contains "@", or contains "linkedin", "phone", "email", "http" or "www.".
   - Then drop the next block when it has at most four lines, each at most 82 characters, and contains a date line or a recipient line ("Hiring Manager", "Hiring Team", "Dear Hiring Manager", "Dear Recruiter", "Recruitment Team", or the company name on its own).
   - Join each remaining block's lines with spaces. Sign-off lines such as "Kind regards", "Sincerely" and "Regards" start their own block.
   - If nothing remains, split the letter on line breaks instead.
3. Render with the presets in section 5.5 and return the first one within the target.

The greeting stays as a body paragraph when it ends with a comma, because the recipient check needs an exact match with no comma.

### 6.8 GET /api/profile (dependency)

The page calls `GET /api/profile` once on load (`src/app/api/profile/route.ts`). The route returns `{ "profile": ... }` for the signed-in user, or 401 when the user is not signed in. The page uses the profile for the manual curation lists and to match stored selections to the current profile. If the call fails, `profile` stays null and manual curation is blocked. The generation routes read the profile themselves.

## 7. Trace panel

The trace comes from advanced responses only (`advancedTrace`). A standard response has no trace, so no panel is shown. The panel sits in a collapsible section titled "Advanced planner trace" for letters, or "Advanced answer trace" for employer answers.

Server shape (`AdvancedGenerationTrace` in `src/lib/cover-letter-advanced.ts`):

| Field | Meaning |
|---|---|
| `mode` | Always `"advanced"` |
| `roleFocus` | The synthesiser's positioning statement (falls back to the auditor's role focus) |
| `missingCriticalRequirements` | Critical requirements the final audit did not cover |
| `supplementalEvidenceTitles` | Titles of the items added by retrieval |
| `uncoveredRequirements` | Uncovered supplemental requirements, plus the missing critical requirements |
| `reviewerNotes` | Reviewer issues, plus "Missing role signal: `<signal>`" entries |
| `finalEvidenceCount` | The number of evidence items used (at most 8) |
| `coverageSummary` | The first eight requirements, each "`<label>` (covered)" or "`<label>` (gap)" |
| `agentSteps` | A log of agent steps. The server sends it; the page drops it and does not display it. |

What `TracePanel` shows:

- The title, and the `roleFocus` line when present.
- A chip reading "N evidence" (`finalEvidenceCount`, or 0).
- "Added evidence": the first four supplemental titles, or "No extra evidence was needed.".
- "Gap review": the first four entries from the missing critical requirements, then the uncovered requirements, then the reviewer notes; or "No critical unsupported gap remained.".
- Coverage chips: the first six entries of `coverageSummary`.

Reading the trace: it shows what the agents reported. The same models wrote and reviewed the letter, so the trace is not an independent check of its claims. Use the claim warning and your own review.

## 8. Tests and eval coverage

### 8.1 Unit tests (`tests/generate/`)

Run from `cv-assistant/`, one file at a time:

```bash
node -r tsconfig-paths/register -r sucrase/register/ts tests/generate/validation.test.ts
```

No npm script runs these files, and the repository has no CI configuration, so they run only when started by hand. Each file exits with code 0 when its assertions pass. All six passed on 2026-11-07 against the working copy.

| File | What it covers |
|---|---|
| `validation.test.ts` | `validateGenerationInput`: missing inputs; a job description of 18,001 characters; index rules (negative, fractional, string, unsafe integer, more than 30, not an array); employer question rules; a 301-character style |
| `clarifications.test.ts` | Decision normalisation: IDs, length caps, duplicate and filler removal, the five-question and five-option caps, the two-question minimum, answer normalisation, `formatClarificationAnswers`, and the decision prompt for both kinds |
| `clarifications-ui.test.ts` | Server-renders `ClarificationQuestions`: the heading, options, buttons and radio inputs for a single-choice question |
| `prompt-tests.ts` | The letter and answer prompts contain the evidence, the decisions and the key rules, and no em dash. It also checks phrases in `cover-letter-advanced.ts` by reading that file as text. |
| `claim-check-tests.ts` | `checkDraftClaims` with a stubbed `fetch`: warning text, prompt content, no warning when supported, the unavailable warning for malformed output, and rejection of a pre-aborted signal |
| `cancellation-tests.ts` | A pre-aborted signal stops `generateAdvancedCoverLetter` and `generateAdvancedEmployerAnswer` before any network call |

Not covered by these tests: the route handlers (status codes, size checks, timeouts and fallbacks); the page's state and transitions; the PDF route (paragraph extraction and presets); the navigator, the mobile bar, the trace panel and the draft area; the advanced agent's behaviour under a mocked model (only cancellation is tested); and the deterministic guards. The guards are covered by `tests/auto-apply/run-tests.ts`, which imports `findLetterDefects`, `findUnsupportedClaims`, `repairLetterStructure` and `stripUnsupportedSentences` from `src/lib/cover-letter-service.ts`. Run it with `npm run test:auto-apply`. It exited 0 on 2026-11-07 at 19:26 against the working copy, which includes one uncommitted test named "stock filler and same-organization framing are flagged and repaired" for the working-copy checks in Appendix A.

### 8.2 Promptfoo eval (`evals/`)

- Command: `npm run eval:letters`, which runs `npx --yes promptfoo@0.125.1 eval -c evals/promptfooconfig.yaml --no-cache`.
- It needs live NVIDIA NIM keys. The config comment names `NVIDIA_API_KEY`, but the code reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` (section 11).
- Flow: `evals/provider.js` runs `evals/run-letter.ts` once per case, with a 200-second timeout. The runner loads `.env` and `.env.local` without overriding variables already set, reads `evals/fixtures/profile.json` (a synthetic profile named "Alex Tester" with two projects and one experience), runs `runCoverLetterAgent` in standard mode (not Advanced Mode), and prints `{text, words, unsupported, defects}`.
- Cases:
  1. Northwind Labs, AI Engineer. The posting asks for Kubernetes, Terraform and "7+ years of experience", which the fixture does not support.
  2. Contoso Cloud, Senior Machine Learning Engineer. The posting asks for Go, Azure Databricks, OAuth/OIDC and threat hunting.
  3. Fabrikam, Software Engineer. A thin job description.
- Assertions on every case:
  - 170 to 400 words, inclusive.
  - No unsupported terms, from `findUnsupportedClaims` run without the job description, so the echo check is off.
  - No defects, from `findLetterDefects`.
  - Contains the first-person "I", and does not contain "candidate".
- Recorded results: `docs/auto-apply-quality-metrics.md` records a run after the first-draft model change in commit `96a9343`. Two of three cases pass. Northwind (257 words) and Fabrikam (293 words) are clean. Contoso Cloud is 146 words, is flagged "too short", and contains an unverified line about owning Python services that the claim lexicon does not catch. The commit message repeats the two-of-three result. I did not run the eval.
- Gaps: the eval targets the Auto Apply agent, not `/generate`. It uses one synthetic profile and three postings. It does not exercise Advanced Mode, decisions, employer answers, PDF export or the routes.

## 9. Known limitations

Items marked "(defect?)" look unintended and need a decision. The others are trade-offs.

Evidence and selection

1. With AI Coaching on and not yet run, no indices are sent, so the writer uses the whole library, while the page shows an evidence count of 0. (defect?)
2. With AI Coaching off, the page still shows the old stored count under "Open generation", while the letter uses the whole library. (defect?)
3. Editing the job description with AI Coaching on clears the stored selection. The next letter then uses the whole library until ranking is run again. (defect?)
4. Manual selections are stored as positions in the profile lists. The page computes positions from the profile it loaded when it opened, while the server reads the live profile. If the profile changed in between, a position can point to a different item, or the server rejects it with "Invalid evidence selection".
5. Nothing stops generation when the profile has no projects or experiences. The writer then receives an empty evidence block.
6. The standard writer receives every selected item in full, with no cap on the total size of the evidence text. Advanced runs cut the final evidence to eight items after sorting experiences first, so a large selection loses its projects first, with no warning.

Decisions

7. The options come from the model. A selected option becomes a "candidate-confirmed" fact for both the writer and the claim check. The panel asks the user to select only what is true, but nothing checks that the options were read.
8. In Advanced Mode, decisions reach the writer, the reviewer and the reviser, but not the planner, retrieval or synthesis steps. A confirmed lead proof therefore does not change which evidence is retrieved.
9. Changing an input while a decision panel is open makes submission fail and closes the panel, so the user must start again.

Generation and checks

10. The advanced path has no internal time budget. The Auto Apply agent does. The advanced path relies on the 240-second limit, after which the route returns 504 without a standard fallback.
11. When the advanced path falls back, the page does not show `advancedFallback`. The only clue is the missing trace.
12. A reviewer failure leads to a revision with no findings, because the fallback score of 85 is below 88. (defect?)
13. The claim check on `/generate` sees only the selected evidence, so a claim supported only by an unselected item is flagged. The Auto Apply check sees the whole profile.
14. The claim check gets one attempt and 18 seconds. A timeout produces the generic unavailable warning, which does not say what failed.
15. The claim-check warnings can contain internal notes rather than claims (`docs/auto-apply-quality-metrics.md`). They are shown without cleaning.
16. The standard path returns model text as it is. The text may contain a code fence or dashes, and no structure is repaired.
17. The word-count rules in the prompts (250 to 350 words for letters; 80 to 180 words for behavioural answers) are not checked.
18. Ideal Word Count and Answer Style are not parsed, so "120" and "two short paragraphs" are treated alike.
19. The employer answer does not require a company or job description, so an answer can be generated with little context.
20. `/api/generate/select` does not pass the request signal to the model, so a cancelled ranking still runs on the server. It has no content-length check and no server-side limit on the job description.
21. The letter and answer routes reject oversized optional fields with 400, while the decisions route cuts them silently.

Storage and privacy

22. The saved draft, including the job description, the letter and the answer, is stored in `localStorage` as plain text. It is not cleared automatically.
23. The page has no way to list or delete drafts. The Clear buttons empty only the letter and the answer. Removing the rest needs the browser's site data to be cleared.

Interface

24. The mobile bar only starts the letter flow. The employer answer needs its own section.
25. Clear empties the letter but keeps the review warning in memory until the next generation.
26. The letter cannot be edited on the page. Users copy it or export it.
27. Starting a generation clears the current letter, warning and trace before the new result arrives. Once a letter or answer starts, there is no way to cancel it.
28. Generation can take up to four minutes (240 seconds), and the page shows only a fixed loading label during that time.

Operations and tests

29. No `/generate` route declares `maxDuration` (three Auto Apply routes do), and `vercel.json` has no `functions` block. The effective limit for `/generate` therefore comes from the in-route timeouts and the hosting defaults.
30. Route behaviour (status codes, size checks and timeouts) is not covered by automated tests.
31. The unit tests are not wired into an npm script or CI.
32. The eval needs live model keys, makes paid model calls, and covers one synthetic profile.
33. A missing `JWT_SECRET` returns 401 for every request, which looks like a sign-in problem.

PDF

34. The page size is US Letter (612 by 792 points), but the date is formatted for en-AU. Confirm the intended page size.
35. The greeting stays as a body paragraph when it ends with a comma.
36. The saved file name differs between the response header and the page (section 11).
37. Premium always embeds Noto Sans, which increases file size. Compact and micro switch fonts depending on the characters present.

## 10. Appendix A: working copy of `src/lib/cover-letter-service.ts`

Checked at 19:26 on 2026-11-07 with `git status` and `git diff HEAD`. The file was modified at 19:22:07. An earlier check in this task found the working copy identical to `96a9343`, so the file has changed since then.

### Uncommitted changes

`cv-assistant/src/lib/cover-letter-service.ts` (7 lines added):

1. Stock filler defect in `findLetterDefects`. The check runs after the bare-title check. It flags "I am" followed by an optional "so" or "very" and then "excited", "thrilled", "delighted" or "passionate". It also flags "what sets me apart", "proven ability", "proven track record", "deep expertise", "cutting-edge" and "bridge the gap". The message is `uses stock filler ("<phrase>") instead of specific experience`.
2. Same-organisation defect in `findLetterDefects`. A letter that says "in the same organization", "company", "team" or "role" is flagged as crediting a separate project to an employer.
3. Same-organisation repair in `repairLetterStructure`. "In the same organization, I" and its company, team and role variants become "I also".

`cv-assistant/tests/auto-apply/run-tests.ts` (13 lines added): one test, "stock filler and same-organization framing are flagged and repaired". It checks that the stock-filler defect fires for "I am excited", that a clean opening does not trigger it, that the same-organisation defect fires, and that the repair turns the sentence into "I also built ...".

`npm run test:auto-apply` (which runs `tests/auto-apply/run-tests.ts`) exited 0 at 19:26 with these changes present.

The eval (`npm run eval:letters`) has not been run against these changes. The Promptfoo figures in `docs/auto-apply-quality-metrics.md` describe commit `96a9343`.

### Committed changes in 96a9343

`96a9343` (2026-11-07 19:00:05 +1100) is the last commit that touched this file. It changed four things:

- `COVER_LETTER_MODELS` now starts with `nvidia/nemotron-3-ultra-550b-a55b`. The list is now nemotron-3-ultra-550b, `poolside/laguna-xs-2.1` and `deepseek-ai/deepseek-v4.1-flash`. It was laguna, nemotron-3-nano-omni and deepseek.
- A comment where unsupported sentences are removed: "Unsupported sentences always go: a fabricated claim is worse than a short letter."
- A `longEnough` variable, set to the letter when it is at least 170 words and well formed, and updated when verifier pruning succeeds.
- After expansion, if the letter is still under 170 words and `longEnough` is set, the text is restored to it.

Its commit message reads: "Promptfoo is 2 of 3 on the stronger model (Contoso thin-evidence case still short)." That is the author's note. I did not re-run the eval.

### File header

Lines 13 to 16 say: "The cover letter agent behind both the /generate studio and Auto Apply." No `/generate` route imports this file (Appendix B, item 2).

## 11. Appendix B: inconsistencies and open questions

1. Brief versus repository. The brief says `src/lib/cover-letter-service.ts` has an uncommitted change. The session-start git status did not list it as modified, and an earlier check found the working copy identical to `96a9343`. At 19:26 on 2026-11-07 the file differs (modified 19:22:07), with the additions described in Appendix A. The brief's statement is true of the current working copy, but it was not true when the task started.
2. File header versus imports. The header says the service is behind the `/generate` studio. No `/generate` route imports it. Its importers are the Auto Apply cover letter route, `src/lib/auto-apply/prepare.ts`, `evals/run-letter.ts` and `tests/auto-apply/run-tests.ts`. Either the comment or the wiring is out of date.
3. Word limits. The "too long" defect says "keep it under 350 words", but the threshold is 400 words (`WORDS(text) > 400`). Other bands in the code: the writer prompt asks for 250 to 350; the expansion target is 220 to 300, accepted up to 380; the grounding target is 220 to 320, accepted from 170 to 400; the eval accepts 170 to 400.
4. API key name. The eval config says it needs `NVIDIA_API_KEY`. The code reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` (`src/lib/ai.ts`), and its error message names those.
5. PDF file name. The route's `Content-Disposition` gives `<company>-cover-letter.pdf`. The page saves `<company>.pdf`, and the browser uses the page's name.
6. Evidence count. With AI Coaching on and not run, the page shows 0 while the server uses the whole library. With AI Coaching off, the page shows the old count under "Open generation".
7. Advanced fallback. The route returns `advancedFallback`, and the page does not read it.
8. Claim-check scope. `/generate` checks against the selected evidence. The Auto Apply check uses the whole profile, and its code comment gives the reason.
9. Reviewer fallback. The fallback approves with a score of 85, which is below the threshold of 88, so a revision always runs after a reviewer failure. Confirm that this is intended.
10. Fallback note. `runCoverLetterAgent` says "ran out of time" for every advanced failure, not only time-outs.
11. Optional field limits. The answer route returns 400 "Input too long" for an ideal word count over 100 or a style over 300. The decisions route cuts the same fields silently.
12. Dash replacement. The advanced path replaces dashes with commas and adds no space. The standard path does not replace them. Confirm the intent.
13. Tests not wired. No npm script or CI entry runs `tests/generate/`.
14. PDF page size. The page is US Letter with an en-AU date. Confirm whether A4 is intended.
15. Unused trace field. The server returns `agentSteps`, but the page neither keeps nor displays it.
16. Model-facing text. The claim check can report internal notes as claims, as `docs/auto-apply-quality-metrics.md` records for Auto Apply. The same claim check runs on `/generate`, and its warnings are shown without cleaning.
17. Two agents. The Auto Apply cover-letter route describes its agent as "the same agent as the /generate studio". It is not. `/generate` uses `src/lib/cover-letter.ts` and `src/lib/cover-letter-advanced.ts` directly. Auto Apply uses `src/lib/cover-letter-service.ts`, which runs the advanced agent on the `easy` preset when requested, while `/generate` runs it on `hard`. Confirm which behaviour is intended.
18. Uncommitted checks. The two defect checks and the repair rule in the working copy are not in `96a9343`, the commit that the recorded eval results describe. The eval was not re-run. The Auto Apply test suite passes with them.
