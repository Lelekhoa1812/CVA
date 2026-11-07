# Contributing guide

This guide is for people changing CV Assistant (CVA). It covers the repository layout, the conventions the code follows, step-by-step recipes for common changes, commit habits, what must not be committed, and the generated `graphify-out/` folder.

The facts were checked against the source and git history on 2026-11-07, at commit `96a9343`. Two tracked files had uncommitted edits at that time, so their line numbers come from the working tree. Line numbers can drift, so search for the name if a line has moved. Paths are relative to `cv-assistant/` unless stated. Test commands and manual QA checklists are in [`testing.md`](testing.md).

## Contents

1. [Repository layout](#1-repository-layout)
2. [Getting started](#2-getting-started)
3. [Coding conventions](#3-coding-conventions)
4. [Adding an API route](#4-adding-an-api-route)
5. [Adding a page](#5-adding-a-page)
6. [Adding a Mongoose model](#6-adding-a-mongoose-model)
7. [Adding a resume template (style6, modelled on style5)](#7-adding-a-resume-template-style6-modelled-on-style5)
8. [Adding an ATS client to Auto Apply](#8-adding-an-ats-client-to-auto-apply)
9. [Adding a model tier](#9-adding-a-model-tier)
10. [Commits and pull requests](#10-commits-and-pull-requests)
11. [What not to commit](#11-what-not-to-commit)
12. [graphify-out/ (generated)](#12-graphify-out-generated)
13. [Known risks for contributors](#13-known-risks-for-contributors)

## 1. Repository layout

### 1.1 Repository root

The git repository root is `/Users/liamle/Downloads/cva`. The `cv-assistant/` folder is not a repository of its own, so git commands run from the root and commit paths start with `cv-assistant/`.

| Path | Purpose |
|---|---|
| `cv-assistant/` | The Next.js application. |
| `README.md` | Project overview and setup. Partly out of date (`testing.md` section 12). |
| `LICENSE.txt` | Licence. |
| `imgsrc/` | Screenshots embedded in the README (14 images). |
| `.claude/launch.json` | Preview configuration for the dev server on port 3100. |
| `.vercel/` | Local Vercel link metadata (git-ignored). |
| `.gitignore`, `.vercelignore` | Ignore rules. Section 11 covers what they do not catch. |

### 1.2 Application (`cv-assistant/`)

| Path | Purpose |
|---|---|
| `src/app/` | App Router pages (`page.tsx`), error boundaries such as `auto-apply/error.tsx`, and `api/` route handlers. There are 47 `route.ts` files. |
| `src/components/` | Feature components in `auto-apply/`, `generate/`, `motion/`, `profile/`, `resume/` and `search/`, plus `Navbar.tsx`. |
| `src/components/ui/` | Hand-written primitives: `button`, `card`, `dialog`, `input`, `label`, `separator`, `switch`, `tabs`, `textarea` and `badge`. Shared layout pieces: `GlassPanel`, `ModuleShell`, `SectionHeading` and `HoverTooltip`. |
| `src/contexts/` | `ThemeContext.tsx`, which handles the light and dark theme. |
| `src/lib/` | Server and shared logic. Key files: `ai.ts` (NVIDIA NIM client), `db.ts`, `auth.ts`, `api.ts` and `utils.ts` (`cn`). Folders: `models/`, `auto-apply/`, `career/`, `search/`, `resume/` and `generate/`. |
| `src/middleware.ts` | Sign-in guard for pages. The root `middleware.ts` re-exports it. |
| `src/instrumentation.ts` | Logs how many NVIDIA keys are configured at start-up. |
| `tests/` | Test runners (`testing.md` section 5). |
| `scripts/` | Live browser tools: `agent-fill.ts`, `autofill-live.ts` and `autofill-safari.ts`. |
| `evals/` | Promptfoo cover-letter eval, its provider and a synthetic profile. |
| `docs/` | Project notes, including `testing.md` and this guide. |
| `public/` | Static files: sample resumes `style1.pdf` to `style5.pdf`, fonts (Fraunces, Manrope and Noto Sans), logos and icons, `harvard.webp` and `1.pdf` (section 11). |
| `graphify-out/` | Generated code graph (section 12). |

Configuration files are `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `middleware.ts`, `vercel.json` and `next-env.d.ts`. The last one is generated and git-ignored.

The app has 8 page files, 47 route handlers and 16 model files. Of the model files, 14 are registered with Mongoose. The other two, `CandidateFact` and `StoryBankItem`, are sub-schemas embedded in `UserContext`.

Some of the largest source files are `src/app/profile/page.tsx` (1,653 lines), `src/app/control-room/page.tsx` (1,267), `src/app/generate/page.tsx` (1,246), `src/lib/search/server/sources.ts` (919), `src/lib/cover-letter-advanced.ts` (874), `src/app/search/page.tsx` (827), `src/lib/resume/pdf-renderer.ts` (614), `src/lib/auto-apply/ats-clients.ts` (593) and `src/lib/auto-apply/engine.ts` (564). Read the relevant one before you change it.

## 2. Getting started

1. Run `npm install` in `cv-assistant/`.
2. Create `cv-assistant/.env`. It is git-ignored. Sign-in needs `MONGO_URI` and `JWT_SECRET`, and the AI features need `NVIDIA_NIM_API_KEY_1`. Section 9 covers the model variables, and `testing.md` section 10.2 lists the variables used for manual QA. Never paste a value into a doc, an issue or a chat.
3. Run `npm run dev` and open `http://localhost:3000`. The preview configuration in `.claude/launch.json` uses port 3100 instead.
4. Before you open a pull request, run `npm run lint` and the suites for the area you changed (`testing.md` section 9).

## 3. Coding conventions

### 3.1 TypeScript and imports

- `tsconfig.json` sets `strict`, `isolatedModules`, `moduleResolution: "bundler"` and target `ES2018`. It excludes `node_modules` and `tests`.
- Inside `src/`, import with the `@/` alias, for example `import { buildApiUrl } from "@/lib/api";`. The tests, scripts and evals do not use the alias. They import with relative paths such as `../../src/lib/auto-apply/fit`, and the harness loads the alias through `tsconfig-paths` (`testing.md` section 4).
- Data shapes are `type` aliases. `src/lib` has 124 `export type` declarations and no `interface`. Infer types from schemas where you can: `z.infer<typeof ...>` (for example in `src/app/api/generate-resume/route.ts`) and `InferSchemaType<typeof ...>` (in the models).
- Validation uses Zod 4 (`"zod": "^4.0.17"`). In Zod 4, `z.record` takes a key schema and a value schema, as in `z.record(z.string(), z.string())`.

### 3.2 Next.js and React

- The app uses the App Router. Pages are `src/app/<route>/page.tsx`. Start a file with `"use client"` when it uses state, effects or browser APIs.
- Route handlers export the HTTP methods they support and return `NextResponse.json(...)`.
- 24 of the 47 route files export `runtime = "nodejs"` and `dynamic = "force-dynamic"`. The two sets are identical. They cover every auto-apply route (16), every control-room route (4), the OCR route and three search routes.
- Three routes also export `maxDuration = 300` because they make long model calls: `auto-apply/job/[jobId]/cover-letter`, `auto-apply/job/[jobId]/prepare` and `auto-apply/session/[id]/run`.
- Connect with `connectToDatabase()` from `src/lib/db.ts`, inside the handler. It connects lazily, caches the connection on `global.mongoose` and uses the database `cv_assistant`.
- Build API URLs in client code with `buildApiUrl` from `src/lib/api.ts`, so that `NEXT_PUBLIC_BASE_PATH` is applied. Of the 35 `fetch` calls in `src/`, 28 use `buildApiUrl`. Five call external services, including the NVIDIA API. The other two are the login page and the `generate-resume` self-call, both covered in section 13.

### 3.3 Styling and theme

- Tailwind CSS 3 is configured with `darkMode: ["class"]`. Colours are CSS variables defined in `src/app/globals.css` (for example `--primary: 198 94% 72%`) and mapped in `tailwind.config.ts` (for example `hsl(var(--primary))`).
- `src/contexts/ThemeContext.tsx` puts a `light` or `dark` class on the root element and stores the choice in `localStorage` under `theme`. The default is `dark`.
- Reuse the shared classes in `globals.css` before you write long utility strings. They include `page-shell` (used by the pages), `glass-panel`, `glass-panel-strong`, `section-kicker`, `surface-subtle`, `input-premium`, `textarea-premium`, `button-primary`, `button-secondary`, `status-chip` with its variants (`status-success`, `status-danger`, `status-info`, `status-warning` and `status-neutral`), `hero-card`, `hero-copy`, `hero-title`, `result-well`, `metric-chip`, `interactive-card` and `font-display`.
- The project has no Radix, class-variance-authority or `components.json`, so the shadcn CLI is not set up. Combine class names with `cn()` from `src/lib/utils.ts`.
- Body text uses Manrope and headings use Fraunces. Both are loaded from `public/fonts` with `next/font/local` in `src/app/layout.tsx`.
- No Prettier or EditorConfig file exists, although the README recommends Prettier. Match the style of the file you are editing.

### 3.4 Comments: "Motivation vs Logic" and "Root Cause vs Logic"

The code records the reason for a non-obvious decision in a labelled block comment.

- **`Motivation vs Logic:`** is used for a design decision. A `Motivation:` line says why, and a `Logic:` line says what the code does.
- **`Root Cause vs Logic:`** is used for a bug fix. A `Root Cause:` line says what went wrong, and a `Logic:` line says how the fix works.

Examples:

- `next.config.ts` opens with a `Motivation vs Logic:` block. A deployment may mount the app under a base path, so the code normalises `NEXT_PUBLIC_BASE_PATH` and passes it to Next.js as `basePath`.
- `src/middleware.ts` has a `Root Cause vs Logic:` block. Under a scoped base path, requests reached the middleware with prefixed URLs, so the hard-coded `/login` and `/api` checks missed them. The fix strips the base path before the guards run and restores it on redirects.
- `src/lib/api.ts` has a `Root Cause vs Logic:` block. Deployments under a base path still used unprefixed `/` API calls, so `buildApiUrl` prefixes every API route with the normalised base path.

The labels appear in 33 files under `src/`, `next.config.ts`, `middleware.ts` and `docs/`. None appears under `tests/`, `scripts/` or `evals/`. Use a block when a decision is not clear from the code. Keep it short, and update it when the logic changes.

### 3.5 Errors, validation and authentication

- Error responses are JSON, `{ "error": "..." }`, with a matching status. The codes in use are 400, 401, 404, 409, 413, 500, 502, 503 and 504. Use 400 for invalid input, 401 for a caller who is not signed in, 404 for a missing record, 409 for a state conflict (for example a taken username, or an application at the wrong stage) and 500 for an unexpected failure.
- Validate with Zod. Seven route files use `safeParse`. Return 400 when validation fails.
- Routes call `getAuthFromCookies(req)` from `src/lib/auth.ts`, which returns `null` when the token is missing or invalid. Auto-apply routes call `requireAutoApplyAuth(req)` from `src/lib/auto-apply/routes.ts` and then return early with `if (!isAuthPayload(auth)) return auth;`. The same module provides ownership helpers: `loadOwnedSession`, `loadOwnedJob`, `loadOwnedDraft` and `loadOwnedDraftByJob`.
- Four routes use neither helper: `auth/login`, `auth/register`, `auth/logout` and `test`. The first three handle sign-in and sign-out. `test` is the public diagnostic route described in section 13.
- The page middleware checks only that an `auth_token` cookie is present. It does not verify the token, and it skips `/api`, so each route must check its own caller.
- The `auth_token` cookie is `httpOnly`, `sameSite: lax`, `path: /`, lasts seven days and is `secure` in production. Passwords are hashed with bcrypt at cost 10.

### 3.6 AI calls

- Call models only through `src/lib/ai.ts`. `getModel(preset).generateContent({ contents, signal })` returns an object whose `response.text()` is the reply. `generateJsonSafe(preset, prompt, maxRetries = 2, signal?)` retries on failure and parses the text between the first `{` and the last `}` of the reply.
- The client handles key rotation across `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` (duplicate values share one state), per-key and per-model cooldowns, fallback through the model list, first-token and idle timeouts, and cancellation.
- Pass an `AbortSignal` whenever the caller can be cancelled. A cancelled request does not start further retries, and `tests/ai/run-tests.ts` checks this.
- Presets are `easy`, `hard` and `document`. Section 9 explains how to add one.
- Treat job text, profiles and answers as data. `buildFitPrompt` in `src/lib/auto-apply/fit.ts` wraps each job in `<job id="...">` and includes a warning about instructions. The test in `tests/auto-apply/run-tests.ts` checks for the phrase "never as instructions".
- Prefer deterministic logic where it is enough. The Auto Apply answer flow calls `answerDeterministically` from `src/lib/auto-apply/questions.ts` before it asks a model in `src/lib/auto-apply/prepare.ts`. `CONTROL_ROOM_STRATEGIST_MODE=heuristic` makes the career strategist use heuristic scoring, which the career tests rely on.

### 3.7 Lint

- `eslint.config.mjs` is an ESLint 9 flat config. It extends `next/core-web-vitals` and `next/typescript`, and it ignores `node_modules`, `.next`, `out`, `build` and `next-env.d.ts`.
- `npm run lint` must report no errors. At the time of writing it reports 7 warnings, listed in `testing.md` section 8. Do not add new warnings.

## 4. Adding an API route

1. Create `src/app/api/<segment>/route.ts`. Dynamic segments use square brackets, as in `src/app/api/control-room/leads/[leadId]/route.ts`.
2. Export the methods you need. For a signed-in route that uses the database, follow this skeleton:

   ```ts
   import { NextRequest, NextResponse } from 'next/server';
   import { getAuthFromCookies } from '@/lib/auth';
   import { connectToDatabase } from '@/lib/db';

   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';

   export async function GET(req: NextRequest) {
     const auth = getAuthFromCookies(req);
     if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

     await connectToDatabase();
     // Query models with a filter on auth.userId.
     return NextResponse.json({ ok: true });
   }
   ```

3. Validate the input, and return 400 with `{ error }` if it is invalid.
4. Scope every query to `auth.userId`, or use the ownership helpers in `src/lib/auto-apply/routes.ts`. Never trust an id from the request until you have checked that it belongs to the caller.
5. For a long model call, export `maxDuration = 300`, as the three long-running routes do, and pass the request's signal into the model call.
6. In client code, call the route with `buildApiUrl('/api/<segment>')`.
7. Put the logic in plain functions under `src/lib`, add cases to the matching runner under `tests/`, and add a manual check to `testing.md` section 11.
8. Do not copy `src/app/api/test/route.ts`. It needs no sign-in and returns raw error messages (section 13).

## 5. Adding a page

1. Create `src/app/<route>/page.tsx`, starting with `"use client"` if the page uses state or effects.
2. Wrap the content in `page-shell`, and use `GlassPanel` or `ModuleShell` from `src/components/ui/`, as the existing pages do.
3. To show the page in the navigation, add an entry to the `links` array at the top of `src/components/Navbar.tsx` (line 10).
4. Sign-in protection needs no change. `src/middleware.ts` redirects requests without an `auth_token` cookie to `/login` for every path except `/login`, `/api`, `_next/` and `favicon.ico`.
5. Client code has no shared handling for 401 responses. Handle the status on the page, and cover it in the QA checklist.
6. Add a checklist for the page to `testing.md` section 11.

## 6. Adding a Mongoose model

1. Create `src/lib/models/<Name>.ts`. This follows the pattern of the existing models:

   ```ts
   import mongoose, { InferSchemaType, Model, Schema } from "mongoose";

   const ExampleSchema = new Schema(
     {
       userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
       status: { type: String, enum: ["open", "closed"], default: "open" },
     },
     { timestamps: true },
   );

   export type Example = InferSchemaType<typeof ExampleSchema>;

   export const ExampleModel: Model<Example> =
     mongoose.models.Example || mongoose.model<Example>("Example", ExampleSchema);
   ```

2. Thirteen model files use `timestamps` and a `userId` field. Follow that for user data. Export the type as `<Name>` and the model as `<Name>Model`, as `UserContextModel` and `JobLeadModel` do.
3. Sub-schemas are exported as `<Name>Schema` with `{ _id: false }` and embedded in a parent model. `CandidateFact.ts` and `StoryBankItem.ts` do this for `UserContext`.
4. Most models set `index: true` on the fields they filter by. Five also call `<Name>Schema.index(...)` for compound indexes: `AutoApplyApplicationDraft`, `AutoApplyJobCandidate`, `AutoApplyEvent`, `AutoApplyMemory` and `JobLead`. `JobLead` has a unique index on `userId` and `dedupeKey`.
5. The database name is fixed to `cv_assistant` in `src/lib/db.ts`. There is no migration tool. Existing documents keep their stored shape, so give new fields defaults and handle missing values when you read them. The Migration section of `docs/career-evaluation-pipeline.md` describes this for `JobEvaluation`.
6. Keep logic in plain functions under `src/lib`. The test runners can exercise those without MongoDB.

## 7. Adding a resume template (style6, modelled on style5)

Style 5 ("Ledger") is the highest-numbered template, and it is the model for a sixth. The steps name the current files. Line numbers may drift.

1. **Drawing function.** In `src/lib/resume/pdf-renderer.ts`, add `drawTemplate6` after `drawTemplate5` (around line 517). Use the same parameter type:
   `args: { ctx: DrawContext; fonts: Fonts; preset: DensityPreset; profile: ResumePdfProfile; items: CandidateItem[]; narrative: PreparedNarrative; accent: RGB }`.
   Reuse the helpers in that file, such as `drawText`, `drawRailSectionBox`, `drawItemList` and `measureBoxParagraph`. The draw context offers `section`, `paragraph`, `bullets` and `ensure`. `MAX_PAGES` (2) limits the output, and `truncateToTwoPages` enforces it.
2. **Dispatch.** Add `'style6'` to `ResumeTemplateId` (line 7). In `drawResumeLayout` (around line 539), add `if (args.template === 'style6') return drawTemplate6(args);` above the default `return drawTemplate1(args);` (line 544).
3. **Route.** Copy `src/app/api/resume/style5/route.ts` to `src/app/api/resume/style6/route.ts` and change `template: 'style5'` to `template: 'style6'`. Styles 1 to 4 differ from style 5 only in that line. The route requires a signed-in caller, rejects an empty selection and a selection above `MAX_RESUME_ITEMS` with 400, loads the profile from `UserModel`, renders with `renderResumePdf` and returns the PDF with `X-CV-Assistant-Resume-*` headers.
4. **Generation endpoint.** Add `'style6'` to the `selectedStyle` enum in `src/app/api/generate-resume/route.ts` (line 10). That route then calls `/api/resume/<selectedStyle>` (line 91).
5. **Type.** Add `"style6"` to the `StyleId` union in `src/components/resume/types.ts` (line 19).
6. **Picker.** Add an entry to `STYLE_OPTIONS` in `src/components/resume/style-options.ts`, copying the style 5 line:

   ```ts
   { id: "style6", label: "Style 6 - <Name>", previewKind: "pdf", previewSrc: buildApiUrl("/style6.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV&zoom=1.05") },
   ```

   `StylePickerDialog.tsx` and `useResumeStudio.ts` both read this array, so the counts and navigation update themselves.
7. **Preview asset.** Add `public/style6.pdf`. No script in the repository writes the style PDFs, so render one from the app and add it by hand.
8. **Copy.** The home page shows "4 Resume Directions" (`src/app/page.tsx`, line 25), although there are five styles. Update it, and update any style list in the README.
9. **Verify.** Run `npm run lint`. Generate a PDF with the new style for a short profile and a long one. Check that each stays within two pages, and check the response headers. No test in the repository covers PDF layout, so review the output by eye.

Notes:

- The routes `coach`, `style-parser`, `summarize` and `enhance` under `src/app/api/resume/` have no client caller (`testing.md` section 12). Do not copy them as examples.
- `generate-resume` builds the style URL from `req.nextUrl.origin`, which does not include the base path. Check this before you deploy under a base path (section 13).

## 8. Adding an ATS client to Auto Apply

Auto Apply reads employer application forms through public ATS APIs. A new provider needs detection, a client that returns postings and questions, and a check that submission is blocked.

1. **Provider and label.** Add the id to `ATS_PROVIDERS` (line 6 of `src/lib/auto-apply/ats.ts`). `AtsProvider` is derived from that array. Add a label to `ATS_LABELS` (line 28). Its type is `Record<AtsProvider, string>`, so TypeScript requires it.
2. **Detection.** In `detectAts` (line 67 of the same file), add host and path rules that return `{ provider, board, jobId }`. Workable is detected (line 104) but has no client yet. `ATS_LINK_PATTERN` in `src/lib/auto-apply/discovery.ts` (line 154) is a separate host list used to find ATS links on listing pages. Update it too if the new host should be found there.
3. **Schema flag.** Add the provider to `SCHEMA_PROVIDERS` (line 26) only if its public API exposes the application questions. `src/lib/auto-apply/jd.ts` (line 46) and `discovery.ts` (lines 285 and 321) check this set before they read the form.
4. **Client.** In `src/lib/auto-apply/ats-clients.ts`, add a list function and a get function. The list function returns `AtsPosting[]`. The get function returns `AtsPostingDetail | null`, which adds `questions: FormQuestion[]`. `AtsPosting` has `provider`, `board`, `jobId`, `title`, `company`, `location`, `workplace`, `descriptionText`, `listingUrl`, `applyUrl` and `postedAt`. The existing functions take different first arguments:
   - `listGreenhouse(board, signal?)` and `getGreenhouse(board, jobId, signal?)`
   - `listLever(site, signal?, company?)` and `getLever(site, jobId, signal?, company?)`
   - `listAshby(org, signal?, company?)` and `getAshby(org, jobId, signal?, company?)`
   - `listSmartRecruiters(company, query, signal?)` and `getSmartRecruiters(company, jobId, signal?)`

   Use `fetchJson` and `fetchText`. They time out after 9 seconds unless a `timeoutMs` is passed, send `Accept-Language: en-AU,en;q=0.9`, and use `cache: "no-store"`. Cap descriptions at `MAX_DESCRIPTION_CHARS` (20,000). Then add a case to the `listBoard` dispatcher (line 549) and to `getPostingDetail` (line 564).
5. **Slug guessing.** When it guesses a company's board slug, `discovery.ts` (line 251) tries only Greenhouse, Lever, Ashby and SmartRecruiters. Add the new provider there if it should be tried.
6. **Verified boards (optional).** Add `{ provider, board, company }` entries to `ATS_DIRECTORY` in `src/lib/auto-apply/ats-directory.ts`. The file header says the entries were verified in 2026-11 as public boards listing Australia-based or APAC-remote roles. Check new entries the same way.
7. **Submission guard.** `isSubmitRequest` in `src/lib/auto-apply/submit-guard.ts` returns false for GET, OPTIONS and HEAD. For other methods it returns true when the path has an `/application(s)` or `/apply` segment, or when the body names `submitApplication`, `ApiSubmitApplication` or `createApplication`. Check that the provider's submit request is caught, and add a case beside the existing ones in `tests/auto-apply/run-tests.ts`.
8. **Tests.** Add detection and parsing cases to `tests/auto-apply/run-tests.ts`, using saved responses or HTML rather than live calls. Run `npm run test:auto-apply`.
9. **Live check (optional).** `scripts/autofill-live.ts` shows how a pack for a real form is defined. It needs network access and browsers (`testing.md` section 6).
10. **UI.** `ReviewStep`, `ApplyStep` and `MatchesStep` read `ATS_LABELS`, so the new label appears without further changes.

Naming note: `src/lib/career/ats.ts` is the resume checker (`validateResumeDraft`). It is unrelated to `src/lib/auto-apply/ats.ts`.

## 9. Adding a model tier

Presets are `easy`, `hard` and `document`. Two other settings sit beside them: a vision list, used when a request contains images, and a supervisor model, used by the Auto Apply supervisor.

1. **Type.** Add the name to `type ModelPreset = 'easy' | 'hard' | 'document';` at line 1 of `src/lib/ai.ts`. The type is not exported.
2. **Defaults.** Add a list to `DEFAULT_MODELS` (line 54). The first model is the primary, and the rest are fallbacks tried in order. The defaults at the time of writing are:
   - `easy`: `poolside/laguna-xs-2.1`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-ultra-550b-a55b`
   - `hard` and `document`: `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-ai/deepseek-v4.1-flash`
3. **Environment override.** `modelList` (line 60) reads `NVIDIA_NIM_<PRESET>_MODELS` as a comma-separated list. The README names the easy, hard, document and vision variables (line 332) but not `NVIDIA_NIM_SUPERVISOR_MODEL`, which `testing.md` section 10.2 does list.
4. **Per-model limits.** `requestModel` sets two values for each model:
   - The first-token timeout comes from `NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S`. The default is 20 seconds, or 55 seconds for `stepfun-ai/step-5-preview` and 75 seconds for `deepseek-ai/deepseek-v4.1-flash` (line 159).
   - `max_tokens` is the lower of `NVIDIA_NIM_MAX_TOKENS` (default 65,536) and a per-model ceiling (line 166). The ceilings are 16,384 for `poolside/laguna-xs-2.1`, 65,536 for `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, 1,048,576 for `stepfun-ai/step-5-preview` and `deepseek-ai/deepseek-v4.1-flash`, and 32,768 for any other model, including `nvidia/nemotron-3-ultra-550b-a55b`.

   Add a branch only if a new model needs different values.
5. **Advanced letter agent.** `src/lib/cover-letter-advanced.ts` declares `type ModelName = 'hard' | 'easy'` (line 9) and uses it for `presetStore` (line 227). Extend it if the advanced agent should use the new tier. The agent falls back to `hard`.
6. **Callers.** Call a tier with `getModel('<tier>')` or `generateJsonSafe('<tier>', ...)`. Examples at the time of writing:
   - `easy`: letter ranking in `src/lib/cover-letter-service.ts`, claim checks in `src/lib/generate/claim-check.ts`, clarification questions in `src/app/api/generate/clarifications/route.ts`, job understanding and control-room scoring in `src/lib/career/`, search intent in `src/lib/search/server/intent.ts`, job fit scoring in `src/lib/auto-apply/fit.ts`, Auto Apply answers and profile drafts in `src/lib/auto-apply/`, a summariser in `src/app/api/profile/route.ts`, and resume summary and skills in `src/lib/resume/pdf-renderer.ts`.
   - `hard`: the career strategist (`src/lib/career/career-strategist.ts`), resume coaching (`src/lib/resume/ai-coaching.ts`), resume content enhancement (`src/lib/resume/pdf-renderer.ts`), the beautify and enhance-targeted routes under `src/app/api/resume/`, `src/app/api/enhance/route.ts`, AI coaching selection in `src/app/api/generate/select/route.ts`, the letter verifier in `src/lib/cover-letter-service.ts`, and the Auto Apply supervisor (`getAutoApplySupervisorModel`).
   - `document`: profile import, in `src/lib/profile-import.ts`.
   - Letter generation chooses `easy` or `hard` for each call (`src/app/api/generate/cover-letter/route.ts`, `src/lib/cover-letter-advanced.ts`).
7. **Tests.** The routing case in `tests/career/run-tests.ts` sets `NVIDIA_NIM_HARD_MODELS`, `NVIDIA_NIM_EASY_MODELS`, `NVIDIA_NIM_DOCUMENT_MODELS` and `NVIDIA_NIM_SUPERVISOR_MODEL`, then asserts `resolveModelName` and `resolveAutoApplySupervisorModelName`. Add the new tier there. `tests/ai/run-tests.ts` covers the model cascade, key rotation, first-token failover and cancellation with a stubbed `fetch`. Add a case there if the tier has special timeouts.
8. **Timeouts and evals.** `NVIDIA_NIM_TIMEOUT_S` is the overall deadline for a request (240 seconds by default). `NVIDIA_NIM_IDLE_TIMEOUT_S` is the longest wait between stream chunks (90 seconds by default). Run `npm run eval:letters` when letter quality may change. It needs network access and a key, and `testing.md` section 7.3 describes the key-name mismatch.

## 10. Commits and pull requests

The habits below come from the last 40 commits in `git log -40`, all by one author.

- Subjects start with a capital letter. Most use the imperative (for example "Fix", "Add" or "Record"), though some are noun phrases. They are 25 to 169 characters long, with a median of 84.5.
- Eight of the 40 subjects start with a short label and a colon, such as "Letter guards:" or "Letter agent:". None uses a Conventional Commits type such as `feat:` or `fix:`.
- Most commits have only a subject and a trailer. A few carry a body, for example "Promptfoo is 2 of 3 on the stronger model (Contoso thin-evidence case still short)." Eval results are recorded this way and in `cv-assistant/docs/auto-apply-quality-metrics.md`.
- Every commit has a `Co-Authored-By:` trailer naming a Claude model. Check the current convention before you add or remove trailers.
- The files changed most often are `cv-assistant/src/lib/cover-letter-service.ts` (23 commits), `cv-assistant/tests/auto-apply/run-tests.ts` (21), `cv-assistant/docs/auto-apply-quality-metrics.md` (12) and `cv-assistant/src/lib/auto-apply/engine.ts` (8). Letter changes usually touch the auto-apply tests and the quality document too.

Recommended practice:

- Keep one logical change per commit, and put the reason in the subject.
- Check `git status` before you commit. At the time of writing, `cv-assistant/src/lib/cover-letter-service.ts` and `cv-assistant/tests/auto-apply/run-tests.ts` had uncommitted changes, so stage only the files you own.
- Before you commit, run `npm run lint` and the suites for the area you changed (`testing.md` section 9). Prompt, model and claim-guard changes also need a recorded `npm run eval:letters` result.
- In a pull request description, summarise the change, list the commands you ran and their results, list the manual QA items from `testing.md` section 11 that you completed, and say which live scripts you did not run.

## 11. What not to commit

Check `git status` before each commit. Two `.gitignore` files apply: the root one and `cv-assistant/.gitignore`. `git check-ignore -v <path>` shows which rule matches a path.

| Path or pattern | Why it matters | Ignored by |
|---|---|---|
| `.env` and any `.env*` file. `cv-assistant/.env` and `cv-assistant/.env.test.local` exist locally. | API keys, `JWT_SECRET`, `MONGO_URI` and test logins. | `cv-assistant/.gitignore` (`.env*`) and the root `.gitignore` (`.env`, `.env.local`, `.env*.local`) |
| `cv-assistant/.codex-data/` | Site-auth records and browser storage for auto-apply sites. Credentials are encrypted only when the user asks the app to remember them. The storage state (`<site>.storage.json`) is plain JSON with cookies and session data. | `cv-assistant/.gitignore` only |
| `agent-fill.png` and other `--screenshot` output | Screenshots of real application forms can show personal details. | Not ignored by any rule |
| Untracked files under `imgsrc/` | The README embeds 14 screenshots from `imgsrc/`. At the time of writing several PNG folders there were untracked, including `imgsrc/_probe/`, whose files (for example `home.png`) look like scratch captures. Check each file before you add it. | Not ignored |
| `cv-assistant/.next/`, `cv-assistant/node_modules/`, `*.tsbuildinfo`, `next-env.d.ts` | Build output, dependencies and generated type files. | `cv-assistant/.gitignore` |
| `.vercel/` | Local Vercel link metadata. | Root and app `.gitignore` |
| `*.pem` | Private keys. | `cv-assistant/.gitignore` |
| `.DS_Store` | Finder metadata. | Root and app `.gitignore` |
| `.vscode/`, `.idea/`, `*.swp`, `*.swo` | Editor files. | Root `.gitignore` |
| `cv-assistant/idea/` | Local notes, under a `# notes` heading. | Root and app `.gitignore` |
| `cv-assistant/public/1.pdf` | Tracked. No source file refers to `/1.pdf`, and it was not opened for this guide. Confirm that it is meant to be public before you change it. | Tracked |

A `git grep` of tracked files for `nvapi-` keys, `sk-` keys of 32 or more characters, AWS access key IDs and PEM private key headers found no matches at the time of writing. That is a pattern check, not a guarantee.

Never paste the values of `.env` variables into docs, issues, pull requests or chat. Variable names are fine.

## 12. graphify-out/ (generated)

`graphify-out/` holds the output of the `graphify` code-graph tool. The tool generates it. Nothing in the application or the tests reads it, and `package.json` has no graphify script.

Contents:

- `GRAPH_REPORT.md` (18 KB) is the summary. Its header reads `Graph Report - cv-assistant (2026-11-05)`. Its sections are Corpus Check (187 files, about 104,553 words), Summary, Graph Freshness, Community Hubs, God Nodes, Surprising Connections, Import Cycles, Communities (70), Knowledge Gaps and Suggested Questions. The Summary reports that 99% of edges were extracted and 1% (39 edges) were inferred.
- `graph.json` (1.9 MB) holds the graph, and `graph.html` (1.5 MB) is an interactive viewer.
- `manifest.json` (36 KB) records, for each file, its `mtime`, `seen` time, `ast_hash` and `semantic_hash`.
- `cache/` holds `ast/v0.9.56-s2/`, which has four JSON files named by 64-character hashes, plus `stat-index.json` and `last_query_stamp`. The `v0.9.56` part is the tool version.
- `.graphify_labels.json` and `.graphify_labels.json.sig` hold labels and a companion `.sig` file. `.graphify_root` contains `.`.
- `2026-11-05/` is a dated copy of the labels, report, graph and manifest.

Git tracks 17 files in this folder.

Freshness: the report says it was built from commit `8035dfb2`. HEAD is `96a9343`, 49 commits later, so the graph is stale. The report's own instruction is to run `graphify update .` after code changes, but no script in this repository runs it.

Guidance:

- Use the report to find your way around, and check facts in the source, because some graph edges are inferred.
- Regenerate the folder with the tool, not by hand. Regeneration changes many tracked files, so review those changes separately from your code change.
- Decide as a team whether the folder stays in git. The build, the tests and the app do not need it.

## 13. Known risks for contributors

These are facts about the current code. Each one is a candidate for a separate change.

- **Site-auth storage.** `src/lib/auto-apply/site-auth.ts` writes Playwright storage state as plain JSON under `.codex-data/auto-apply/site-auth/`. Only remembered credentials are encrypted, with AES-256-GCM. The only caller of `saveSiteAuthState` is `src/lib/auto-apply/browser-session.ts`, and its visible-browser switch is limited to non-production builds by `NODE_ENV` and `AUTO_APPLY_DEV_BROWSER=true`.
- **Fallback secret.** `getAuthSecret()` in `site-auth.ts` falls back to `AUTO_APPLY_SITE_AUTH_SECRET`, then `JWT_SECRET`, then the constant `cv-assistant-site-auth`. Sign-in needs `JWT_SECRET`, so the constant matters only where that variable is missing. Remove the constant.
- **Public diagnostic route.** `GET /api/test` needs no sign-in. It returns the raw database error message with a 500 status. Remove it or protect it before production. Lint also reports its unused `NextRequest` import.
- **Pack in the URL.** When the encoded pack is under 24,000 characters, "Open form & copy pack" in `src/components/auto-apply/ApplyStep.tsx` appends it to the employer's URL as `#cva=...`. Fragments are not sent to the server, but they show in the address bar, and scripts on the employer's page can read them. The pack holds the answers for that application, including answers to questions such as work rights and salary.
- **Base path.** The login page calls `/api/auth/login` or `/api/auth/register` and redirects to `/profile` without `NEXT_PUBLIC_BASE_PATH`. `src/app/api/generate-resume/route.ts` calls its style route through `req.nextUrl.origin`, which excludes the base path. These paths were read from the code and have not been run under a base path.
- **Unused resume routes.** `src/app/api/resume/coach`, `style-parser`, `summarize` and `enhance` have no client caller. They still call models when invoked, and they need sign-in.
- **Large page components.** `src/app/profile/page.tsx` (1,653 lines), `src/app/control-room/page.tsx` (1,267) and `src/app/generate/page.tsx` (1,246) mix state, data access and layout. Put new logic in `src/lib`, where it can be tested without a browser.
- **Promptfoo key name.** The README says `npm run eval:letters` needs `NVIDIA_API_KEY`. The app reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` (`testing.md` section 7.3).
- **Test harness dependency.** `sucrase`, which the test scripts load, is not listed in `package.json`. It arrives through `tailwindcss` (`testing.md` section 4.5).
