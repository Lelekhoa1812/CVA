# Testing and quality guide

This guide covers how CV Assistant (CVA) is tested and checked: every npm script in `cv-assistant/package.json`, each automated test runner and what it asserts, the live browser scripts, the Promptfoo cover-letter evals, lint, the configured dev server for manual QA, and a manual QA checklist for each page.

The content was derived from the source code. Observed results and timings come from runs on 2026-11-07 on macOS (Darwin 25.6.0) with Node.js v26.0.0, against commit `96a9343`. Where a command was not run, the guide says so. Paths are relative to `cv-assistant/` unless stated otherwise.

## Contents

1. [Summary](#1-summary)
2. [Prerequisites](#2-prerequisites)
3. [npm scripts](#3-npm-scripts)
4. [Test harness](#4-test-harness)
5. [Automated test suites](#5-automated-test-suites)
6. [Live browser scripts](#6-live-browser-scripts)
7. [Cover-letter evals (Promptfoo)](#7-cover-letter-evals-promptfoo)
8. [Lint](#8-lint)
9. [Which test should I run after changing X?](#9-which-test-should-i-run-after-changing-x)
10. [Running the app locally for manual QA](#10-running-the-app-locally-for-manual-qa)
11. [Manual QA checklists](#11-manual-qa-checklists)
12. [Known gaps and mismatches](#12-known-gaps-and-mismatches)

## 1. Summary

| Command | What it checks | Network | API keys | MongoDB | Observed result (2026-11-07) |
|---|---|---|---|---|---|
| `npm run lint` | ESLint over the project | No | No | No | Exit 0, 7 warnings, 0 errors (about 2 s) |
| `npm run test:unit` | Career, profile import, strategist, resume ATS check | No | No | No | Exit 0, 18 of 18 passed (about 1 s) |
| `npm run test:auto-apply` | Auto Apply rules, letter guards, ATS parsing | No | No | No | Exit 0, 48 of 48 passed (under 1 s) |
| `npm run test:search` | Search streaming, retries, cancellation | No (fetch is stubbed) | No | No | Exit 0, 12 of 12 passed (about 8 s) |
| `npm run test:ai` | NVIDIA NIM key rotation, model cascade, streaming | No (fetch is stubbed) | No (fake keys are set by the script) | No | Exit 0, summary line printed (about 1 s) |
| `npm run verify:career` | `lint`, then `test:unit`, then `test:auto-apply` | No | No | No | Exit 0 (about 3 s) |
| `npm run test:autofill-safari` | Live autofill in Safari through `safaridriver` | Yes (live employer form) | No | No | Not run in this review |
| `npm run agent:fill -- --pack <file>` | Fills a live form in a real browser from a pack, never submits | Yes | No | No | Not run in this review |
| `npm run test:autofill-live` | Live autofill on three employer forms in three engines | Yes | No | No | Not run in this review |
| `npm run eval:letters` | Promptfoo cover-letter quality on live model output | Yes | Yes (`NVIDIA_NIM_API_KEY_1` to `_9`) | No | Not run in this review |
| `npm run dev`, `build`, `start` | Application server and build, not tests | Optional | Optional | Needed for saved data | Not run in this review |

Not wired to any npm script: the six files in `tests/generate/`. Run them by hand (section 5.5). All six passed when run individually.

## 2. Prerequisites

- **Node.js.** The README asks for Node.js 22. `package.json` has no `engines` field, so nothing enforces a version. The observed run used Node.js v26.0.0.
- **Dependencies.** Run `npm install` in `cv-assistant/`. The lockfile is `package-lock.json`.
- **Environment files.** The `npm run` test scripts run plain Node and do not load a `.env` file. Only `evals/run-letter.ts` reads `.env` and `.env.local`, and it does so itself. The offline suites were run with `MONGO_URI`, `JWT_SECRET` and `NVIDIA_NIM_API_KEY_1` unset in the shell, and they passed.
- **MongoDB.** `src/lib/db.ts` connects lazily, only when `connectToDatabase()` is called. None of the test runners call it, so no test needs a database.
- **CI.** The repository has no `.github/` directory, so nothing runs these commands automatically. Run the relevant commands locally before merging.

## 3. npm scripts

Every script in `cv-assistant/package.json`, in the order it appears.

### 3.1 Application scripts

- **`npm run dev`** runs `next dev` on port 3000 by default. Pass `-- -p 3100` to use another port (section 10). On start-up, `src/instrumentation.ts` logs either `NVIDIA NIM: N distinct API key(s) configured.` or a warning that AI features are unavailable. Sign-in and saved data need `MONGO_URI` and `JWT_SECRET`. Not run in this review, because it writes to `.next/`.
- **`npm run build`** runs `next build`. The type check covers everything `tsconfig.json` includes, which is `src/`, `scripts/` and `evals/`. It excludes `tests/`. Not run in this review, because it rewrites `.next/` and `tsconfig.tsbuildinfo`.
- **`npm run start`** runs `next start` against the output of `npm run build`. Build first.

### 3.2 Lint

- **`npm run lint`** runs `eslint` with no path argument, so every file the flat config matches is linted, including `tests/`, `scripts/` and `evals/`. Configuration is in section 8. Observed: exit 0, with `✖ 7 problems (0 errors, 7 warnings)`. Warnings do not fail the script.

### 3.3 Automated suites

- **`npm run test:unit`** runs `tests/career/run-tests.ts`. It prints one `✓ <case name>` line per case, then `All 18 career unit tests passed.` The log also contains many `Warning: getPathGenerator - ignoring character ...` lines from font handling in the PDF test. They do not change the result. Observed: exit 0, about 1 s.
- **`npm run test:auto-apply`** runs `tests/auto-apply/run-tests.ts`. It prints `PASS <case name>` per case, then `48 auto-apply tests passed.`. On failure it prints `FAIL <case name>` with the error on stderr, then `N of 48 tests failed.`, and exits 1. Observed: exit 0, under 1 s.
- **`npm run test:search`** runs `tests/search/run-tests.ts`. It prints `PASS <case name>` for each of the 12 cases and no summary line. A failure sets exit code 1. Observed: exit 0, about 8 s, because the retry back-off uses real timers.
- **`npm run test:ai`** runs `tests/ai/run-tests.ts`. On success it prints `NVIDIA NIM routing and streaming tests passed`. Observed: exit 0, about 1 s.
- **`npm run verify:career`** runs `npm run lint && npm run test:unit && npm run test:auto-apply`. Observed: exit 0, about 3 s. It does not run `test:search`, `test:ai` or the `tests/generate/` scripts, so it is not a full gate.

### 3.4 Live browser scripts

- **`npm run test:autofill-safari`** runs `scripts/autofill-safari.ts`. It needs macOS, Safari and "Allow remote automation" (section 6.1). Expected output: `safari filled X / Y ...` followed by `autofill-safari: passed`. Not run in this review.
- **`npm run agent:fill -- --pack <file.json> [flags]`** runs `scripts/agent-fill.ts`. Section 6.2.
- **`npm run test:autofill-live`** runs `scripts/autofill-live.ts`. Section 6.3.

### 3.5 Evals

- **`npm run eval:letters`** runs `npx --yes promptfoo@0.125.1 eval -c evals/promptfooconfig.yaml --no-cache`. The Promptfoo version is pinned in the script, not in `dependencies`. Section 7.

## 4. Test harness

### 4.1 How the runners load code

Every suite is started the same way:

```bash
node -r tsconfig-paths/register -r sucrase/register/ts tests/<area>/run-tests.ts
```

- `tsconfig-paths/register` resolves the `@/*` alias from `tsconfig.json` (`@/*` maps to `./src/*`). Several modules under test import `@/lib/...`, so the alias must resolve at run time. The test files themselves use relative imports such as `../../src/lib/...`.
- `sucrase/register/ts` transpiles TypeScript when a file is required. It does not type-check. Type errors in tests and source are not caught by the test scripts.
- `tests/` is listed under `exclude` in `tsconfig.json`, so `next build` does not type-check the tests either. A separate tsconfig would be needed to type-check them.

### 4.2 Style

- **No test framework.** No `jest`, `vitest`, `mocha`, `chai` or `node:test` import or dependency exists in `package.json`, `tests/`, `scripts/` or `evals/`.
- **Assertions** use `node:assert/strict`.
- **Case runners.** The career and auto-apply runners hold an array of `{ name, run }` cases, run them in order and keep going after a failure. The search runner does the same and prints `PASS` or `FAIL`.
- **Sequential script.** The AI runner is one script. The first failed assertion stops it.
- **Standalone scripts.** The `tests/generate/` files are independent. Several use top-level `assert` calls, so a failure throws and exits non-zero.

### 4.3 Isolation and determinism

- The search and AI runners replace `globalThis.fetch` with stubs. The search runner restores it after every case. No real network call is made.
- The AI runner sets `NVIDIA_NIM_API_KEY_1` to `_9` and `NVIDIA_NIM_EASY_MODELS` to fake values.
- The career runner sets `CONTROL_ROOM_STRATEGIST_MODE=heuristic`, so strategist scoring never calls a model. The comment in the code says this is for unit tests without AI keys.
- The career runner temporarily sets `NODE_ENV=production` to test the production browser gate, then restores it.
- The auto-apply runner calls the job description crawler only with unsafe URLs (`ftp:` and `javascript:`), so it never reaches the network.

### 4.4 Output and failure behaviour

| Runner | Pass output | Failure behaviour |
|---|---|---|
| career | `✓ <name>` per case, then `All 18 career unit tests passed.` | `✗ <name>` with the error; exit code 1 |
| auto-apply | `PASS <name>` per case, then `48 auto-apply tests passed.` | `FAIL <name>` on stderr, then `N of 48 tests failed.`; exit code 1 |
| search | `PASS <name>` per case; no summary line | `FAIL <name>` on stderr; exit code 1 |
| ai | `NVIDIA NIM routing and streaming tests passed` | Error on stderr; exit code 1 |
| generate (six files) | One line each, for example `Claim check tests passed` | Assertion error; exit code 1 |

### 4.5 Limits of the harness

- **`sucrase` is not declared.** `package.json` does not list it. It arrives through `tailwindcss` 3.x, which depends on `sucrase` ^3.35.0 (`package-lock.json`, dev dependency). Upgrading or removing Tailwind could break every test script. Declare `sucrase` as a dev dependency if the harness is kept.
- **No coverage tool and no CI.**
- **No fixtures folder.** `tests/fixtures/` does not exist. The only fixture folder is `evals/fixtures/`, which holds `profile.json`, a synthetic profile. Most test data is written inline in the test files.

## 5. Automated test suites

### 5.1 `tests/career/run-tests.ts` (18 cases)

| Area | Cases | What is asserted |
|---|---|---|
| Profile import | 1 | `extractProfilePdfParts` reads text from a text PDF, renders an image-only page as a JPEG, keeps both text and image on a mixed page, and rejects non-PDF input with "Could not read the PDF". |
| Model routing | 1 | `resolveModelName` honours `NVIDIA_NIM_HARD_MODELS`, `NVIDIA_NIM_EASY_MODELS` and `NVIDIA_NIM_DOCUMENT_MODELS` (the first entry wins). `resolveAutoApplySupervisorModelName` honours `NVIDIA_NIM_SUPERVISOR_MODEL`. |
| Auto Apply browser adapters | 2 | A screenshot becomes a Responses API `input_image` part with a `data:image/png;base64` URL. A screenshot becomes a `computer_call_output` with a `computer_screenshot` payload at `original` detail. |
| Auto Apply browser gate | 1 | In production the local browser is never available. `startVisibleBrowserSession` returns `manual_guided` with reason `browser_unavailable` and a "disabled on this deployment" message. |
| Auto Apply ranking | 2 | Jobs with the same `dedupeKey` are merged. Roles from restricted sources get the `restricted_source_manual_guidance` flag. Jobs whose company is the placeholder "Unknown" are not merged. |
| Profile draft and evidence | 2 | `refineAutoApplyProfileDraft` keeps the prompt to 8 words or fewer, keeps at most 4 must-have keywords, drops "software engineer" as a keyword, normalises the company blacklist and removes generic exclusions. `suggestGroundTruthSelection` picks relevant experience or project evidence. |
| Auto Apply safety | 3 | Unsupported visa and work-rights questions need user review and get an empty answer. Saved answers default to no reusable consent (`explicitReusableConsent` is false). `submitApplicationSchema` only accepts an explicit `confirmSubmit`. |
| Liveness | 2 | Pages that say the job "has expired" are classed `expired`. Pages with apply controls and enough text are classed `active`. |
| Resume ATS check (`src/lib/career/ats.ts`) | 2 | Placeholder markers such as `<metric>` count as unsupported claims and fail the check. A complete draft passes with 100% keyword coverage. |
| Strategist | 2 | A remote, high-fit role with covered evidence is `prioritize`. An onsite role under remote-only preferences is `skip`, with a work-mode mismatch gap. |

### 5.2 `tests/auto-apply/run-tests.ts` (48 cases)

| Area | Cases | What is asserted |
|---|---|---|
| Cover-letter guards and repair (`src/lib/cover-letter-service.ts`) | 14 | `findLetterDefects` flags run-on title openings, chat-style closers, bare title sentences, a missing company or role, a missing sign-off, candidate phrasing, truncated links, short letters, and years or degree fields. `repairLetterStructure` puts greetings and sign-offs on their own lines, adds one closing sentence, removes contact details from the body and does not duplicate openings. `findUnsupportedClaims` flags invented employment, projects treated as employers, invented degrees, unsupported year counts, "180-minute" figures and copied posting text. `stripUnsupportedSentences` removes only flagged sentences and does not split on "Next.js" or "2.5". |
| Question classification and answers (`questions.ts`, `answering.ts`) | 16 | `classifyQuestion` maps real form labels (names, work rights, sponsorship, salary, notice, demographic, previous employment, consent, workplace, motivation, LinkedIn, resume upload). Deterministic answers come from the profile. Sensitive facts such as work rights, sponsorship and salary need the user. Declarations and in-office questions are never auto-confirmed. Voluntary demographic questions default to "Prefer not to say". Remembered answers apply only to the same question, except sponsorship answers, which carry over to differently worded questions. Choices map to exact option labels. Citizenship options are never guessed. Current company comes from the ongoing experience. Optional URL slots are not drafted by AI. Choice questions get an evidence-based suggestion. A user edit clears a missing flag, but a failed mapping stays flagged. |
| ATS detection and form parsing (`ats.ts`, `ats-clients.ts`, `jd.ts`) | 5 | `detectAts` identifies Greenhouse, Lever, Ashby, SmartRecruiters and job boards, reads `gh_jid` links, and ignores unsafe schemes. Company slug candidates strip legal suffixes. The Lever form parser reads standard and custom question cards. Listing extraction reads JSON-LD descriptions and external ATS links. The job description crawl keeps supplied text and reports `none` when nothing is readable. |
| Discovery, titles and concurrency | 4 | The role matcher accepts AI and ML engineer titles and rejects unrelated ones. The location matcher handles cities, multi-location strings, "Australia" and remote roles. `cleanTitle` strips Markdown and repeated slash titles. `mapWithConcurrency` respects its limit and keeps order. |
| Application state and sessions (`state.ts`) | 4 | Legacy job records get safe defaults for list and score fields. A run in the searching, scoring or preparing phase with no update for more than 150 s is stalled. Idle or recently updated runs are not. The state machine allows the happy path and blocks jumps. Session phase and remaining application slots derive from job stages. |
| Submission safety and approval | 3 | The agent-fill guard blocks submit requests but lets uploads and page loads through. The approved-payload hash changes when any content changes. The autofill pack is well formed, the bookmarklet starts with `javascript:`, and the autofill function does not contain `.submit(` or a submit-button click pattern (checked by text match). |
| Fit scoring and letter helpers | 2 | The fit prompt wraps job text in `<job id>` tags and says it is data, never instructions. Verdict thresholds are stable (90 strong, 70 good, 50 stretch, 10 poor). Answer echo matching works, and `isWellFormedLetter` rejects degenerate text. |

Note on one case: "verifier pruning keeps paragraph breaks and removes only the flagged sentence" re-implements its pruning expression inline. It does not call the production verifier, so it is a weak check on that behaviour.

### 5.3 `tests/search/run-tests.ts` (12 cases)

All cases use `streamSearchJobs` from `src/lib/search/server/stream.ts` with a stubbed `fetch`.

| Area | Cases | What is asserted |
|---|---|---|
| Automatic retry and recovery | 3 | A network error is retried once and the search completes. Two failures are retried twice and the third attempt succeeds. An HTTP 503 is retried once. Each retry emits the `AUTOMATIC_RETRY_MESSAGE` progress event with status `running`. |
| Retry exhaustion and HTTP errors | 2 | After three failed attempts a source error is emitted ("failed after retry") and the search still completes. HTTP 404 from one source is retried twice and does not stop the other source, which still completes. |
| Streaming progress | 2 | Progress is delivered while a fetch is still pending. A fetch rejection while the consumer is paused is handled, and the retry happens. |
| Empty results | 1 | A successful empty response is `complete` with a "without matches" message, not `blocked`. |
| Cancellation | 2 | Aborting during the retry delay stops the stream promptly with no further calls. Aborting while a detail page loads is not swallowed as a fallback. |
| De-duplication and counts | 2 | Results already streamed before a failure are not repeated after the retry. Progress counters never decrease, and the final `resultsFound` matches unique filtered matches across changed result sets. |

### 5.4 `tests/ai/run-tests.ts` (one script, 10 scenarios)

The script exercises `getModel` and `generateJsonSafe` from `src/lib/ai.ts`:

1. Streamed SSE text is reassembled across chunk boundaries, with CRLF line endings and multi-byte characters.
2. An HTTP 429 from one key is retried with a second key.
3. A 429 from the first model in `NVIDIA_NIM_EASY_MODELS` moves the request to the next model.
4. A first-token timeout (`NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S=1`) fails over to the next model.
5. Two concurrent requests use two distinct keys.
6. Duplicate key values count as one credential, so each model is tried once with that key.
7. With no keys configured the call fails with "No NVIDIA NIM API keys".
8. Aborting a request fails it with "cancelled".
9. A cancelled JSON request does not start retries.
10. A stream that ends with a non-`stop` finish reason (for example `length`) fails with "did not finish normally".

### 5.5 `tests/generate/` (six files, run by hand)

None of these files is referenced by `package.json`, `docs/` or any other script. Run each one with the same loader:

```bash
node -r tsconfig-paths/register -r sucrase/register/ts tests/generate/<file>
```

| File | Covers | Pass output |
|---|---|---|
| `validation.test.ts` | `validateGenerationInput` in `src/lib/generate/validation.ts`: missing inputs, a job description over 18,000 characters, invalid evidence indices (negative, fractional, string, unsafe integer, more than 30 items), a missing question for employer answers, a 4,000-character question limit and a 300-character answer style limit. | `Generation validation tests passed` |
| `prompt-tests.ts` | `buildCoverLetterPrompt` and `buildEmployerQuestionPrompt`: evidence summaries and details reach the writer, candidate decisions are included, unselected options are not facts, word bands (250 to 350 for letters, 80 to 180 for answers), no em dash and no unrelated example facts. It also reads `src/lib/cover-letter-advanced.ts` as text and checks that five prompt phrases are present. That check is brittle and fails if the wording changes. | `Generation prompt context tests passed` |
| `claim-check-tests.ts` | `checkDraftClaims` in `src/lib/generate/claim-check.ts`: unsupported claims become a `reviewWarning`, the prompt includes evidence and clarification context, a supported draft returns `{}`, malformed model output gives "could not complete", and an aborted call is cancelled. | `Claim check tests passed` |
| `cancellation-tests.ts` | `generateAdvancedCoverLetter` and `generateAdvancedEmployerAnswer` reject at once when the signal is already aborted, and make no network request. | `Advanced generation cancellation tests passed` |
| `clarifications.test.ts` | `src/lib/generate/clarifications.ts`: question and option normalisation (ids, de-duplication, at least two questions, at most five questions with five options, filler options such as "Other" or "Not sure" removed, length caps), answer formatting ("Unselected options are not facts", "Chosen: ..."), and the clarification prompt for letters and employer answers. | `Clarification validation tests passed` |
| `clarifications-ui.test.ts` | Server-renders `src/components/generate/ClarificationQuestions.tsx` with `react-dom/server`. Checks "Decision 1 of 2", radio buttons only, "Write my own answer", "Skip this decision", "Generate without these decisions", and that later decisions stay hidden until the user continues. | `Clarification decision UI tests passed` |

### 5.6 Fixtures

`tests/fixtures/` does not exist. The synthetic profile used by the Promptfoo evals is `evals/fixtures/profile.json` (the "Alex Tester" profile, with two projects and one experience). The automated suites build their data inline.

## 6. Live browser scripts

The three scripts in `scripts/` open real employer forms or a real browser. They are manual tools and are not part of `verify:career`. None was run in this review.

### 6.1 Browser setup

- **Playwright** is pinned by `package.json` to `^1.60.0`, and version 1.60.0 is installed.
- **Chromium.** The scripts launch the installed Google Chrome through Playwright's `channel: "chrome"`, not Playwright's bundled Chromium. Install Google Chrome. The scripts do not need `npx playwright install chromium`.
- **Firefox and WebKit.** Install with `npx playwright install firefox webkit`. To preview the install without downloading, run `npx playwright install --dry-run firefox webkit`. That command was run here. It printed the cache locations under `~/Library/Caches/ms-playwright/` and downloaded nothing. On Linux, add `--with-deps` to install system libraries, as the CLI help describes.
- **Safari.** Requires macOS. From the script header: Safari > Settings > Developer > tick "Allow remote automation". If the Developer tab is missing, enable Safari > Settings > Advanced > "Show features for web developers" first. This was not verified on a machine in this review.

### 6.2 `scripts/agent-fill.ts` (`npm run agent:fill`)

Usage:

```bash
npm run agent:fill -- --pack pack.json [--resume /path/to/cv.pdf] [--headless] [--engine chromium] [--screenshot shot.png]
```

| Flag | Meaning |
|---|---|
| `--pack <file>` | Required. A JSON autofill pack (section below). |
| `--resume <file>` | Optional. Attached to the first file input on the page. |
| `--engine` | `chromium` (default, system Chrome), `firefox` or `webkit`. |
| `--headless` | No window. Saves a screenshot and exits. |
| `--screenshot <file>` | Screenshot path for `--headless`. Defaults to `agent-fill.png` in the current working directory. |

Behaviour:

- It opens `job.applyUrl` and runs the same in-page autofill as the bookmarklet.
- It then fills any combobox fields the first pass could not finish, using real keyboard and mouse input, and attaches the resume.
- Submit-like requests are aborted at network level (`isSubmitRequest`), and submit events are cancelled inside the page. The script never clicks a submit or apply button.
- Without `--headless`, it waits until you close the window. Review the form and press Submit yourself.
- Output includes `Bookmarklet pass: X/Y filled`, a line for each real-input attempt, `verified: resume present` or a warning, and `Blocked N submission request(s). Nothing was submitted.`

Getting a pack. The Apply step's "Open form & copy pack" copies the JSON pack to the clipboard. `GET /api/auto-apply/job/<id>/pack` (signed in) returns `{ pack, text, applyUrl }`, and the job must already be approved (otherwise HTTP 409). Save only the `pack` property to the file. The script's header says to use "Copy answers as text", but that button copies the plain-text version, which this script cannot read. Use the JSON pack.

### 6.3 `scripts/autofill-live.ts` (`npm run test:autofill-live`)

- No flags. It runs three fixed live forms: a Greenhouse form (Quantium, job 4005581201), an Ashby form (Neara) and a Lever form (Blinq).
- It runs each form in `chromium` (system Chrome), `firefox` and `webkit`, nine runs in total, in that order.
- A run passes when every field is reported filled and no `submit` event fires on the page. Otherwise it throws.
- Output: one line per run in the form `<engine> filled X / Y <label:status ...> | SHOWN: ...`, then `autofill-live: all engines passed`.
- Each run waits up to 45 s for the page to load and then sleeps 2.5 s. Network is required. Employer sites change, so a failure can come from the site rather than from the code.

### 6.4 `scripts/autofill-safari.ts` (`npm run test:autofill-safari`)

- Uses the Quantium Greenhouse form from section 6.3, with a hard-coded WebDriver port of 4723. Stop any other `safaridriver` process on that port first.
- It starts `safaridriver -p 4723`, creates a Safari session, navigates to the form, waits 4 s, runs the autofill with a 90 s script timeout and requires every field to be filled. It deletes the session and kills the driver in a `finally` block.
- Output: `safari filled X / Y ...`, then `autofill-safari: passed`. A failure prints the message and exits 1.

## 7. Cover-letter evals (Promptfoo)

### 7.1 Files

| File | Role |
|---|---|
| `evals/promptfooconfig.yaml` | Promptfoo configuration: one prompt template, a custom provider, default assertions and three cases. |
| `evals/provider.js` | Custom provider `cva-cover-letter-agent`. For each case it runs `node -r tsconfig-paths/register -r sucrase/register/ts evals/run-letter.ts '<json>'` with the working directory set to `cv-assistant/`, a 200 s timeout and a 4 MB output buffer. It takes the last stdout line as the result. |
| `evals/run-letter.ts` | Loads `.env` and `.env.local` from `cv-assistant/` (it sets only variables that are not already set and strips surrounding quotes), reads `evals/fixtures/profile.json`, calls `runCoverLetterAgent` and prints `{ text, words, unsupported, defects }` as one JSON line. |
| `evals/fixtures/profile.json` | The synthetic "Alex Tester" profile: Bachelor of Software Engineering, Python, React, Next.js, MongoDB, two projects and one experience at "Acme Analytics". |

### 7.2 Cases and assertions

Every case is checked by four `javascript` assertions, each of which returns `pass` and a reason:

1. Word count is between 170 and 400 inclusive.
2. `unsupported` is empty. This is `findUnsupportedClaims` on the letter against the fixture profile.
3. `defects` is empty. This is `findLetterDefects` on the letter.
4. The letter contains the first-person pronoun "I" and does not contain the word "candidate".

The three cases:

| Company | Title | What it tests |
|---|---|---|
| Northwind Labs | AI Engineer | Skills that match the profile (Python, LLMs), with a posting that also asks for Kubernetes, Terraform, 7+ years and a Master's degree that the fixture does not support. |
| Contoso Cloud | Senior Machine Learning Engineer | A posting that demands Go, Azure Databricks, OAuth/OIDC and threat hunting, none of which the fixture supports. |
| Fabrikam | Software Engineer | A thin one-sentence job description. |

The config's `prompts` entry (`"{{title}} at {{company}}"`) is not used by the provider, which reads `company`, `title` and `jd` from the case variables.

### 7.3 Environment variable (mismatch)

- The code reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` (`src/lib/ai.ts` and `src/instrumentation.ts`). Empty slots are ignored, and duplicate values count once.
- The header comment in `evals/promptfooconfig.yaml` and the README both say the eval needs `NVIDIA_API_KEY`. **No code reads `NVIDIA_API_KEY`.** Use the `NVIDIA_NIM_API_KEY_*` names, either in `cv-assistant/.env` or in the shell.
- `cv-assistant/.env` defines `NVIDIA_NIM_API_KEY_1` through `_9`. This was checked by variable name only.
- `evals/run-letter.ts` does not read `.env.test.local`.

### 7.4 Running and reading results

- Run `npm run eval:letters` from `cv-assistant/`. It needs network access and keys, and each case makes several model calls. A provider call can take up to 200 s before it times out.
- Promptfoo prints a result table and a pass or fail summary. Its exact format depends on the Promptfoo version. Use `npx promptfoo view` to inspect outputs, as the README says.
- Not run in this review.
- The most recent recorded run is in `docs/auto-apply-quality-metrics.md`. It shows 2 of 3 cases passing, with Contoso Cloud at 146 words, flagged as too short. Treat that as a historical record, not a current result.

## 8. Lint

- `eslint.config.mjs` is a flat config for ESLint 9. It extends `next/core-web-vitals` and `next/typescript` through `FlatCompat`, and ignores `node_modules`, `.next`, `out`, `build` and `next-env.d.ts`.
- `npm run lint` checks all files it finds, including `tests/`, `scripts/` and `evals/`.
- There is no Prettier configuration and no `.editorconfig`, although the README recommends Prettier.
- Current result: 0 errors and 7 warnings, all `@typescript-eslint/no-unused-vars`:
  - `src/app/api/resume/beautify/route.ts` line 40: `error` is unused.
  - `src/app/api/resume/enhance/route.ts` line 41: `error` is unused.
  - `src/app/api/resume/summarize/route.ts` line 40: `error` is unused.
  - `src/app/api/test/route.ts` line 1: `NextRequest` is unused.
  - `src/lib/cover-letter-service.ts` line 316: `evidence` is unused.
  - `src/lib/resume/pdf-renderer.ts` lines 482 and 533: `railY` is unused.
- A new error fails `npm run lint`. A new warning does not, so keep the count from rising.

## 9. Which test should I run after changing X?

| If you change | Run | Also check |
|---|---|---|
| `src/lib/ai.ts` (key rotation, cascade, streaming, timeouts) | `npm run test:ai` and `npm run test:unit` | `npm run eval:letters` when model output quality may change |
| Model tier names or defaults in `src/lib/ai.ts` | `npm run test:unit` (routing case) | The README environment table, and section 9 of the contributing guide |
| `src/lib/search/**`, `src/app/api/search/**` | `npm run test:search` | `/search` checklist |
| `src/lib/auto-apply/ats.ts`, `ats-clients.ts`, `ats-directory.ts`, `discovery.ts`, `jd.ts` | `npm run test:auto-apply` | `npm run test:autofill-live` if form parsing changed (network) |
| `src/lib/auto-apply/questions.ts`, `answering.ts`, `ground-truth.ts`, `profile-draft.ts` | `npm run test:auto-apply`, `npm run test:unit` | `/auto-apply` Review step |
| `src/lib/auto-apply/state.ts`, `engine.ts`, `prepare.ts`, `persistence.ts` | `npm run test:auto-apply` | A full `/auto-apply` run from Brief to Apply |
| `src/lib/auto-apply/submit-guard.ts`, `pack.ts`, `autofill-script.ts` | `npm run test:auto-apply` | `npm run agent:fill` or `npm run test:autofill-safari` against a live form (network) |
| `src/lib/cover-letter-service.ts`, `src/lib/cover-letter*.ts` | `npm run test:auto-apply` (letter guards), `tests/generate/prompt-tests.ts`, `claim-check-tests.ts`, `cancellation-tests.ts` | `npm run eval:letters` |
| `src/lib/generate/validation.ts` | `tests/generate/validation.test.ts` | `/generate` checklist |
| `src/lib/generate/clarifications.ts`, `src/components/generate/ClarificationQuestions.tsx` | `tests/generate/clarifications.test.ts`, `tests/generate/clarifications-ui.test.ts` | `/generate` clarification steps |
| `src/lib/career/**` (strategist, liveness, resume ATS check, control room) | `npm run test:unit` | `/control-room` checklist |
| `src/lib/profile-import.ts`, `src/app/api/ocr/**` | `npm run test:unit` (PDF case) | `/profile` import checklist |
| `src/lib/resume/pdf-renderer.ts`, `src/app/api/resume/pdf-layout.ts`, a style route, or `src/components/resume/style-options.ts` | `npm run lint` only; no automated test checks PDF layout | Generate a PDF for every style and check the two-page limit and text fit |
| `src/lib/resume/ai-coaching.ts`, `high-impact-rewrite.ts`, `text-section-prompts.ts`, other `src/components/resume/**` | `npm run lint` | `/resume` checklist |
| `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/auth/**` | `npm run lint` | `/login` checklist, then sign out and sign back in |
| `src/lib/db.ts`, `src/lib/models/**` | `npm run lint` | `GET /api/test`, then save on `/profile` |
| `next.config.ts`, `src/lib/api.ts`, or any URL built in client code | `npm run lint`, `npm run build` | Run once with `NEXT_PUBLIC_BASE_PATH` set (section 12) |
| Other `src/components/**` | `npm run lint` | The matching page checklist |
| `scripts/**` | Run the script you changed (it is live) | `npm run lint` |
| Any TypeScript in `src/` | `npm run lint` and `npm run build` (the build does the type check) | The matching checklist |
| Dependencies (`sucrase`, Tailwind, Playwright, Next.js) | All four suites and the six `tests/generate/` scripts | `npm run build` |

If you are unsure, run `npm run verify:career`, `npm run test:search`, `npm run test:ai` and the six `tests/generate/` scripts together.

## 10. Running the app locally for manual QA

### 10.1 Start the dev server

- **Direct:** `cd cv-assistant && npm run dev`, then open `http://localhost:3000`.
- **Configured port:** the repository root contains `.claude/launch.json` (`/Users/liamle/Downloads/cva/.claude/launch.json`, not inside `cv-assistant/`). It defines one server named `cv-assistant` that runs `npm --prefix cv-assistant run dev -- -p 3100` and uses port 3100, so the app is at `http://localhost:3100`. `docs/auto-apply-quality-metrics.md` uses port 3100 for its live runs.
- Next.js uses port 3000 unless `-p` is passed after `--`.

### 10.2 Environment for manual QA

Keep values in `cv-assistant/.env`, which git ignores. Do not paste them into issues, docs or commits.

| Variable | Needed for | Notes |
|---|---|---|
| `MONGO_URI` | Any saved data (`src/lib/db.ts`) | Connects lazily to the `cv_assistant` database. A missing value throws "Missing MONGO_URI in environment". |
| `JWT_SECRET` | Sign-in and every authenticated route | `signAuthToken` throws if it is missing. `verifyAuthToken` catches that error and returns `null`, so every authenticated route returns 401. |
| `NVIDIA_NIM_API_KEY_1` to `_9` | AI features: profile enhancement, resume coaching, letters, search intent, Auto Apply, Control Room | Without keys, AI calls fail with "No NVIDIA NIM API keys configured". |
| `NVIDIA_NIM_EASY_MODELS`, `_HARD_MODELS`, `_DOCUMENT_MODELS`, `_VISION_MODELS`, `_SUPERVISOR_MODEL` | Optional model overrides | Defaults are in `src/lib/ai.ts`. |
| `NVIDIA_NIM_BASE_URL`, `_TIMEOUT_S`, `_IDLE_TIMEOUT_S`, `_FIRST_TOKEN_TIMEOUT_S`, `_MAX_TOKENS` | Optional request tuning | Read in `src/lib/ai.ts`. The README documents only some of them. |
| `NEXT_PUBLIC_BASE_PATH` | Optional, for an app mounted under a path | Read by `next.config.ts` and `src/lib/api.ts`. See section 12. |
| `CONTROL_ROOM_STRATEGIST_MODE=heuristic` | Optional, Control Room scoring without AI | Used by the tests. |
| `AUTO_APPLY_DEV_BROWSER=true` | Optional, legacy local browser preview | Ignored when `NODE_ENV` is `production`. No page in the UI calls the browser routes. |
| `AUTO_APPLY_BROWSER_HEADLESS` | Optional, `true` or `false` | The default is headed outside production. |
| `AUTO_APPLY_SITE_AUTH_SECRET` | Optional key for encrypting saved site credentials | Falls back to `JWT_SECRET`, then to a hard-coded string. See the contributing guide. |

### 10.3 First sign-in and health check

1. Open `/login`, choose "Don't have an account? Create one", and register. Usernames must be 3 to 20 characters of letters, digits, `_` or `-`. Passwords are hashed with bcrypt. Registering sets the `auth_token` cookie and redirects you to `/profile`.
2. Fill in your profile first. Most other pages read it, and `/resume` shows "Your profile is needed" until you do.
3. Check the database connection: `curl http://localhost:3000/api/test`. A healthy response is `{"status":"ok","message":"MongoDB connected"}`. A missing `MONGO_URI` or an unreachable database returns HTTP 500 with the error message. This route needs no sign-in.

## 11. Manual QA checklists

Use these after changing a page or the API behind it. Each item comes from the code for that page. Items marked **(keys)** need AI keys, **(network)** need internet access, and **(MongoDB)** need a database.

### /login

- [ ] Without the `auth_token` cookie, `/` and every other page except `/login` redirect to `/login`.
- [ ] Creating an account with a new username signs you in and lands on `/profile`. **(MongoDB)**
- [ ] A username shorter than 3 characters, longer than 20, or containing characters other than letters, digits, `_` and `-` shows the matching error.
- [ ] Registering a username that is already taken shows "already taken" and suggestions. Clicking a suggestion fills the username field.
- [ ] Signing in with the wrong password shows "Invalid credentials".
- [ ] The show and hide password button changes the field type and its accessible label.
- [ ] Switching between "Create Account" and "Sign In" clears the error and suggestions.
- [ ] With `NEXT_PUBLIC_BASE_PATH` set, the sign-in request and the redirect to `/profile` both reach the right place (section 12).

### / (home)

- [ ] The hero and three pillar cards render in both themes. The navbar toggle (aria label "Toggle theme") switches them, and the choice persists in `localStorage` under the key `theme`.
- [ ] The calls to action go to `/profile`, `/resume` and `/generate`.
- [ ] The stats card says "4 Resume Directions". The resume studio offers five styles (`STYLE_OPTIONS`), so this copy is out of date.
- [ ] The navbar links go to Your Profile, Resume Lab, Cover Letter, Job Search, Auto Apply and Control Room. The mobile menu opens and closes at phone width.
- [ ] "Logout" calls `POST /api/auth/logout` and then returns you to `/login`.

### /profile

- [ ] The profile loads (`GET /api/profile`) and shows Completeness and Signal Strength. **(MongoDB)**
- [ ] Add, edit and remove an experience and a project. Removing one item leaves the others.
- [ ] "Save Profile" (`PUT /api/profile`) persists. Reload and confirm the values are still there.
- [ ] "Import Text" posts pasted text to `/api/ocr`. Check the merged fields before you save. **(keys)**
- [ ] The file picker accepts `.pdf` and `.docx` only. A PDF over 12 pages is rejected. A scanned PDF page is read as an image by the document model. **(keys)**
- [ ] "Enhance" on a project or experience (`POST /api/enhance`) fills the description field with the improved text. **(keys)**
- [ ] The "Copy" buttons copy the formatted project or experience text to the clipboard.
- [ ] With an expired or invalid token, API calls return 401. The client has no explicit 401 handling, so check what the page shows.

### /generate

- [ ] Generating without a company name or job description is rejected. The server returns "Missing inputs".
- [ ] The evidence lists load your Experiences and Projects. Empty lists show "No experiences added yet." or "No projects added yet.".
- [ ] "Run AI Coaching" ranks the evidence (`POST /api/generate/select`). "Cancel" stops a ranking request. **(keys)**
- [ ] Manual selection needs at least one item. If none is selected, a message says so.
- [ ] Clarifications (`POST /api/generate/clarifications`) appear one at a time ("Decision 1 of N"). Choose an option or "Write my own answer", or use "Skip this decision" or "Skip decisions and generate". **(keys)**
- [ ] "Generate Cover Letter" (`POST /api/generate/cover-letter`) fills "Generated letter". Check that the length is near the target (250 to 350 words per the prompt) and that every claim traces to your profile. **(keys)**
- [ ] The "Employer answer" tab answers a question using Ideal Word Count and Answer Style (`POST /api/generate/employer-question`). **(keys)**
- [ ] "Export PDF" (`POST /api/generate/cover-letter/pdf`) downloads a PDF. An empty letter shows "Exported PDF is empty".
- [ ] "Copy" and "Clear" work. The draft survives a reload (`localStorage` key `cv-assistant.generate.cover-letter.v3`), and "Clear" removes it.

### /resume

- [ ] With no profile, the gate shows "Your profile is needed" and "Open profile". A failed profile load shows "Try again".
- [ ] Without AI coaching, you can select at most 20 projects and experiences (`MAX_RESUME_ITEMS`). The README says 7, which is out of date.
- [ ] With AI coaching on, the job description needs at least 20 words (`MIN_JOB_DESCRIPTION_WORDS`).
- [ ] "Customize styling preferences" saves with "Save Preferences". "Next: Content Questions" moves on. Content coaching accepts at most 3 items.
- [ ] While coaching is open, Generate is disabled with the message "Please complete your AI coaching session first, or click Reset to cancel". "Reset" cancels coaching.
- [ ] The style picker shows five styles with previews. Generate stays disabled until a style is chosen ("Select a style to enable Generate.").
- [ ] "Generate PDF" previews the PDF, and "Download PDF" downloads it. Check the response headers `X-CV-Assistant-Resume-Pages` and `X-CV-Assistant-Resume-ATS-Score` in the network panel. **(keys for coaching, MongoDB)**
- [ ] Each style gives at most two pages (`MAX_RESUME_PAGES`), readable text and the chosen accent colour. Test a short profile and a long one for each style.
- [ ] The style previews load while signed in. As written, the middleware matcher also applies the sign-in guard to files in `public/` such as `/style5.pdf`, so they may redirect to `/login` without a cookie. This was read from the code and not checked in a browser.

### /search

- [ ] At least one platform must be selected ("Select at least one platform.").
- [ ] Platforms are LinkedIn, SEEK, Indeed, CareerOne, Adzuna and Talent.com. "Select all" toggles every platform.
- [ ] Posted-within (any time to 30 days), workplace (any, remote, hybrid, on-site) and employment type (any, full-time, part-time, contract, internship) filters apply to the results. **(network)**
- [ ] A search streams results (NDJSON from `/api/search/jobs/stream`). Each platform shows queued, running, complete, blocked or error. Transient failures show the automatic retry message. **(network)**
- [ ] "Cancel" stops the search. "Reset" clears the results.
- [ ] Result cards link to the application and the listing, both in new tabs. Duplicates can be archived, and hidden cards are counted.
- [ ] "Start questions" (Advanced Q&A, `POST /api/search/advanced-sequential`) asks one question at a time. Answers appear under "Previous answers", and an "AI brief" summary follows. **(keys)**
- [ ] With one platform failing (for example, offline or blocked), the others still return results.

### /auto-apply

- [ ] The stepper shows Brief, Matches, Review and Apply. Later steps stay disabled until earlier ones are ready, and a disabled step explains why in its tooltip.
- [ ] Without a profile, Brief shows "Import your CV on the Profile page". Standing answers (work rights, sponsorship, salary, notice, relocation) save to your account and show "Saved to your account.". **(MongoDB)**
- [ ] "Maximum applications to prepare" and the Autopilot option limit what the run prepares.
- [ ] Starting a search creates a session (`POST /api/auto-apply/session`). The page polls every 2.5 s and shows "Finding your matches" while the run is active. "Search again" and "Previous searches" work. **(network, keys)**
- [ ] Matches show a fit score and gaps. Roles from restricted sources carry the manual-guidance flag.
- [ ] Review shows the source of each answer ("From your profile", "Your standing answer", "Remembered" or "Drafted by AI"). Low-confidence answers are flagged.
- [ ] Sensitive answers (work rights, sponsorship, salary) come only from you. The AI must not fill them in silently.
- [ ] "Remember this answer for future applications" is unticked by default. Ticking it is the consent step for saving an answer to reusable memory (see the consent case in section 5.1).
- [ ] "Rewrite from job posting" re-runs the cover letter. The advanced option uses the advanced agent (`POST /api/auto-apply/job/<id>/cover-letter` with `advanced: true`). **(keys)**
- [ ] "Approve application" and "Approve all ready (N)" move roles to Apply. "Withdraw approval" is shown on approved roles.
- [ ] Apply: "Open form & copy pack" copies the JSON pack, then opens the employer form. When the pack is small enough, it is passed in the URL fragment (`#cva=`).
- [ ] "Copy bookmarklet code" gives a bookmark. On the employer page the bookmarklet fills the form and never submits it.
- [ ] "Copy answers as text" copies the plain-text answers.
- [ ] Nothing submits automatically. Only "I submitted it", followed by its confirmation step, marks an application applied.
- [ ] "Cancel" and "Refresh answers" work on a running session (`POST .../cancel`, `POST .../refresh-answers`).
- [ ] A run in the searching, scoring or preparing phase with no update for 150 s is reported as stalled, and the workspace recovers.

### /control-room

- [ ] "Save Context" (`PATCH /api/control-room/context`) saves your targets, preferred and avoided locations, remote-only mode, salary floor and target range, and score floor. Reload to confirm. **(MongoDB)**
- [ ] "System State" and "Saved leads" load (`GET /api/control-room/overview`). **(MongoDB)**
- [ ] Opening a lead (`GET /api/control-room/leads/<id>`) shows the fit score, recommendation, dimension scores, blockers and gap heatmap. "Open Apply URL" and "Open Listing" open in a new tab.
- [ ] "Run Specialist Workflow" (`POST /api/control-room/leads/<id>/orchestrate`) shows "Running Workflow..." and then updates the scores. With `CONTROL_ROOM_STRATEGIST_MODE=heuristic`, no AI call is made. **(keys, unless heuristic)**
- [ ] In heuristic scoring, remote-only mode skips onsite roles (the career suite checks this).
- [ ] Evaluations written before the v2 pipeline are left out of the gap heatmap, so it can be empty until leads are re-run (see `docs/career-evaluation-pipeline.md`).
- [ ] Expired listings are flagged by the liveness check. **(network)**

## 12. Known gaps and mismatches

These were found while writing this guide. Each is a fact about the current code or documents.

- **README is out of date for testing.** It lists `dev`, `build`, `start` and `lint` only. It omits the test, verify, live and eval scripts. It also says the eval needs `NVIDIA_API_KEY`, which no code reads (section 7.3).
- **README contradicts the code in other places.** It says "Select up to 7 projects and experiences" (the code allows 20 without AI coaching), documents `POST /api/profile` (the code exports `GET` and `PUT`), says Node.js 22 while its own Dockerfile uses `node:18-alpine`, and gives a Dockerfile that installs only production dependencies before `npm run build`. That build normally needs dev dependencies such as TypeScript and Tailwind. The Dockerfile was not built here.
- **Unused routes.** No client code calls these routes: `/api/resume/coach`, `/api/resume/style-parser`, `/api/resume/summarize`, `/api/resume/enhance`, `/api/search/advanced`, `/api/auto-apply/profile-draft`, the auto-apply SSE `events` route, the auto-apply `browser/start` and `browser/action` routes, and `/api/test` (which is a diagnostic route). Check for callers outside the repository before you remove any of them.
- **`tests/generate/` is not wired in.** Six files run only by hand, and nothing checks that they still pass.
- **`tests/fixtures/` does not exist.** The fixture used by the evals is in `evals/fixtures/`.
- **One auto-apply case is a self-check.** The verifier pruning case re-implements its logic inline (section 5.2).
- **`verify:career` is partial.** It excludes `test:search`, `test:ai` and the `tests/generate/` scripts.
- **No PDF layout or auth tests.** Resume PDF output, middleware, login and the database connection have no automated tests.
- **Seven lint warnings** remain (section 8).
- **`sucrase` is transitive** through `tailwindcss` (section 4.5).
- **Hard-coded live targets.** `scripts/autofill-live.ts` and `scripts/autofill-safari.ts` depend on three named employer forms, which can change or close. `scripts/autofill-safari.ts` uses a fixed port.
- **Header instruction mismatch.** `scripts/agent-fill.ts` says to use "Copy answers as text". That button copies plain text, but the script needs the JSON `pack` (section 6.2).
- **Base path (not verified at run time).** Two code paths build URLs without `NEXT_PUBLIC_BASE_PATH`. The login page calls `fetch` with raw `/api/auth/*` paths and redirects with `window.location.replace('/profile')`. `POST /api/generate-resume` calls its own style route at `${req.nextUrl.origin}/api/resume/<style>`, and the origin does not include the base path. Both would be expected to fail under a base path. Confirm in a browser before relying on a base path.
- **Unauthenticated diagnostic route.** `GET /api/test` needs no sign-in and returns raw database error messages.
- **Site-auth files are plain text in part.** Saved usernames and passwords are encrypted, but the Playwright storage state (cookies and session data) is written as plain JSON under `.codex-data/`. Section 11 of the contributing guide covers the risk.
