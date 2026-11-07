# Deployment and operations

Derived from the source on 2026-11-07. Paths are relative to `cv-assistant/` unless stated otherwise. Items marked "not verified" depend on platform behaviour that this repository cannot test.

## Contents

1. Deployment targets and what the repository contains
2. Prerequisites
3. Vercel
4. Manual build and run
5. Running under a base path
6. Dev-only browser preview (Playwright and Chromium)
7. Native and binary modules
8. Security model
9. Rate limiting
10. Operations
11. Troubleshooting
12. Corrections to the root README

## 1. Deployment targets and what the repository contains

Two deployment paths are supported by the configuration:

- **Vercel**, configured by `vercel.json` (`framework: nextjs`).
- **Self-hosted Node.js**, using `next build` and `next start`.

The repository does **not** contain:

- A Dockerfile, `.dockerignore`, or any container configuration. No container instructions are given in these documents.
- CI configuration. There is no `.github/` directory at the repository root.
- A Node version pin: no `engines` field in `package.json`, and no `.nvmrc`, `.node-version` or `.tool-versions`.
- An `.npmrc`, a `.env.example`, or a Playwright or Jest configuration file.
- Platform firewall, WAF or rate-limit rules. `vercel.json` defines none.
- Process-manager, reverse-proxy or TLS configuration.

## 2. Prerequisites

| Requirement | Source | Notes |
|---|---|---|
| Node.js | The root `README.md` says "Node.js 22". `pdfjs-dist` 4.10.38 declares `engines.node >= 20`. Next.js 15.5.15 declares `^18.18.0 \|\| ^19.8.0 \|\| >= 20.0.0` | Use Node.js 22, as the README says. Node.js 20 is the lowest version that satisfies every declared engine. Nothing in the repository enforces the version. On Vercel, set the Node.js version in the project settings, because the repository does not pin it |
| npm | `package-lock.json` is present. `vercel.json` uses `npm install` and `npm run build` | Use the lockfile |
| MongoDB | `MONGO_URI` (`src/lib/db.ts`). Database `cv_assistant` | Must be reachable from the runtime. Users are stored with a unique `username` index (`src/lib/models/User.ts`) |
| NVIDIA NIM API key | `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` | At least one. Without a key the AI features fail (section 11) |
| `JWT_SECRET` | `src/lib/auth.ts` | Required for sign-in and for every authenticated route |
| Chromium (optional) | Playwright, for the dev-only preview (section 6) | Not needed in production |

## 3. Vercel

### 3.1 Project configuration

`vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

- **Root directory.** The Vercel link metadata (`.vercel/`) and `.vercelignore` sit at the repository root, one level above `cv-assistant/`. The repository does not record the project's Root Directory setting. The application (`package.json`, `next.config.ts`, `vercel.json`, `src/`) is in `cv-assistant/`, so the project must build from that folder. Confirm this in the project settings.
- **Upload exclusions.** `.vercelignore` at the repository root excludes `**/.env`, `**/.env.*`, `**/node_modules`, `**/.next`, and `.git`.
- **Environment variables** are set in the Vercel project. Names are listed in `docs/configuration.md`. The minimum is `MONGO_URI`, `JWT_SECRET` and at least one `NVIDIA_NIM_API_KEY_n`. Set `NEXT_PUBLIC_BASE_PATH` before the build if the app is mounted under a sub-path. Leave `AUTO_APPLY_DEV_BROWSER` unset. The code blocks the preview in production anyway (section 6).
- **Per-environment keys.** The README advises configuring NIM keys for each target environment before deploying. The code has no environment-specific behaviour beyond `NODE_ENV`.

### 3.2 Function duration per route

Source: `grep` for `maxDuration`, `export const runtime` and `export const dynamic` in `src/app/api/**/route.ts`. Three route files set `maxDuration`. The other 44 use the platform default, which the repository does not state. Check the project's function duration setting in Vercel.

| Route | Methods | `maxDuration` | Runtime export | Auth check |
|---|---|---|---|---|
| `/api/auth/login` | POST | default | none | none (public) |
| `/api/auth/logout` | POST | default | none | none (public) |
| `/api/auth/register` | POST | default | none | none (public) |
| `/api/auto-apply/job/[jobId]/applied` | POST | default | nodejs | JWT |
| `/api/auto-apply/job/[jobId]/browser/action` | POST | default | nodejs | JWT |
| `/api/auto-apply/job/[jobId]/browser/start` | POST | default | nodejs | JWT |
| `/api/auto-apply/job/[jobId]/cover-letter` | POST | **300** | nodejs | JWT |
| `/api/auto-apply/job/[jobId]/pack` | GET | default | nodejs | JWT |
| `/api/auto-apply/job/[jobId]/prepare` | POST | **300** | nodejs | JWT |
| `/api/auto-apply/job/[jobId]` | GET, PATCH | default | nodejs | JWT |
| `/api/auto-apply/preferences` | GET, PUT | default | nodejs | JWT |
| `/api/auto-apply/profile-draft` | POST | default | nodejs | JWT |
| `/api/auto-apply/session/[id]/approve` | POST | default | nodejs | JWT |
| `/api/auto-apply/session/[id]/cancel` | POST | default | nodejs | JWT |
| `/api/auto-apply/session/[id]/events` | GET | default | nodejs | JWT |
| `/api/auto-apply/session/[id]/refresh-answers` | POST | default | nodejs | JWT |
| `/api/auto-apply/session/[id]` | GET, PATCH | default | nodejs | JWT |
| `/api/auto-apply/session/[id]/run` | POST | **300** | nodejs | JWT |
| `/api/auto-apply/session` | GET, POST | default | nodejs | JWT |
| `/api/control-room/context` | GET, PATCH | default | nodejs | JWT |
| `/api/control-room/leads/[leadId]/orchestrate` | POST | default | nodejs | JWT |
| `/api/control-room/leads/[leadId]` | GET | default | nodejs | JWT |
| `/api/control-room/overview` | GET | default | nodejs | JWT |
| `/api/enhance` | POST | default | none | JWT |
| `/api/generate-resume` | POST | default | none | JWT |
| `/api/generate/clarifications` | POST | default | none | JWT |
| `/api/generate/cover-letter/pdf` | POST | default | none | JWT |
| `/api/generate/cover-letter` | POST | default | none | JWT |
| `/api/generate/employer-question` | POST | default | none | JWT |
| `/api/generate/select` | POST | default | none | JWT |
| `/api/ocr` | POST | default | nodejs | JWT |
| `/api/profile` | GET, PUT | default | none | JWT |
| `/api/resume/beautify` | POST | default | none | JWT |
| `/api/resume/coach` | POST | default | none | JWT |
| `/api/resume/enhance-targeted` | POST | default | none | JWT |
| `/api/resume/enhance` | POST | default | none | JWT |
| `/api/resume/style-parser` | POST | default | none | JWT |
| `/api/resume/style1` | POST | default | none | JWT |
| `/api/resume/style2` | POST | default | none | JWT |
| `/api/resume/style3` | POST | default | none | JWT |
| `/api/resume/style4` | POST | default | none | JWT |
| `/api/resume/style5` | POST | default | none | JWT |
| `/api/resume/summarize` | POST | default | none | JWT |
| `/api/search/advanced-sequential` | POST | default | nodejs | JWT |
| `/api/search/advanced` | POST | default | nodejs | JWT |
| `/api/search/jobs/stream` | POST | default | nodejs | JWT |
| `/api/test` | GET | default | none | none (public) |

Notes:

- "Runtime export" `nodejs` means the file sets `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`. The 24 files that do this are the rows marked `nodejs`. The rest rely on Next.js defaults. For route handlers, the default runtime is Node.js.
- "JWT" means the handler references `getAuthFromCookies` or `requireAutoApplyAuth`. This was confirmed by grep for the helper names, not by reading every handler.
- Routes that call NIM can each wait up to `NVIDIA_NIM_TIMEOUT_S` (240 s by default) for each call to the model wrapper, across all of its attempts. The generation routes also set a 240 s request budget in code. No `maxDuration` is set on them, so the platform's limit applies. If that limit is lower than the route's own budget, the platform stops the function first. The platform's default is not recorded in the repository and was not verified for this project.

### 3.3 Background work with `after()`

`src/app/api/auto-apply/session/[id]/run/route.ts` imports `after` from `next/server`. It is the only use of `after()` in the repository, and it has two call sites:

1. **Prepare mode** (`body.mode === "prepare"`, line 32). The callback calls `startHeartbeat(id)`, runs `preparePending`, and stops the heartbeat in `finally`.
2. **Full run** (line 41). The callback calls `runPipeline`. `runPipeline` starts its own heartbeat (`src/lib/auto-apply/engine.ts`, line 119).

The POST handler returns `202` with `{"started": true}` at once. The callback then runs inside the same function invocation. It is bounded by that route's `maxDuration` of 300 s.

Run locking and stale-run detection (`src/lib/auto-apply/engine.ts`, `src/lib/auto-apply/state.ts`):

| Mechanism | Value | Behaviour |
|---|---|---|
| Heartbeat | Every 20 s (`engine.ts`, line 63) | Refreshes `run.updatedAt` while the phase is `searching`, `scoring` or `preparing` |
| `claimRun` | Line 68 | Atomically takes the lock when no run is in an active phase, or when `run.updatedAt` is older than `RUN_STALL_MS`. Otherwise the route returns `409` |
| `RUN_STALL_MS` | 150,000 ms (`state.ts`, line 66) | A run without a heartbeat for this long is treated as stalled |
| `PREPARE_LOCK_MS` | 240,000 ms (`state.ts`, line 64) | Stale window for preparation locks (`engine.ts`, line 402) |

If the function is cut off, the heartbeat stops. The session is then recognised as stalled after 150 s, instead of showing "preparing" indefinitely.

### 3.4 Files the bundle must contain

| Need | How the repository provides it | Risk |
|---|---|---|
| pdf.js worker for `/api/ocr` | `outputFileTracingIncludes` in `next.config.ts` adds `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`. The source sets no `GlobalWorkerOptions.workerSrc`, so pdf.js loads the worker from the package at runtime | Covered by tracing |
| `@napi-rs/canvas` for `/api/ocr` | `outputFileTracingIncludes` adds `node_modules/@napi-rs/canvas-linux-*/**/*` | Covered by tracing. Only the Linux binaries are traced into this route |
| Noto Sans fonts for PDF generation | `src/app/api/resume/embed-noto-sans-fonts.ts` reads `public/fonts/NotoSans-Regular.ttf` and `public/fonts/NotoSans-Bold.ttf` with `fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', ...))` at module load (lines 10 to 13) | **Not covered by tracing.** `public/fonts` is not in `outputFileTracingIncludes`. A missing file makes the module fail to load, which affects `/api/generate/cover-letter/pdf` and `/api/resume/style1` to `/api/resume/style5` (through `src/lib/resume/pdf-renderer.ts`). Verify on a preview deployment. Not verified |
| Writable scratch space | None in the code path used in production | Browser-preview state and remembered site credentials are written under `process.cwd()/.codex-data` (section 8). Those writes run only in the dev-only browser flow |

## 4. Manual build and run

```bash
cd cv-assistant
npm install
npm run build          # runs next build
npm run start -- -p 3000
```

- `npm run build` runs `next build`. `next.config.ts` does not disable type checking or linting, so TypeScript errors and ESLint errors fail the build. ESLint warnings do not.
- The build does not connect to MongoDB or call NIM. No page or layout calls `connectToDatabase`. Server secrets are read when requests arrive. `NEXT_PUBLIC_BASE_PATH` is the only variable that must match between build and run.
- `next start` needs a completed build in `.next`. Next.js uses port 3000 by default. `-p` changes it.
- The `.next` output records the base path. Use the same `NEXT_PUBLIC_BASE_PATH` value for `next build` and `next start` (section 5).

For a quick production-like check, set the runtime variables in `.env.local` or in the shell, then run the two commands above.

## 5. Running under a base path

`NEXT_PUBLIC_BASE_PATH` mounts the application under a sub-path, for example `/cv-assistant`.

**What the code does with it:**

| Location | Behaviour |
|---|---|
| `next.config.ts` (line 15) | Normalises the value (trims, removes trailing slashes, adds a leading slash) and sets `basePath` |
| `src/lib/api.ts` (line 4) | Prefixes every client `fetch` built with `buildApiUrl` |
| `src/middleware.ts` (lines 8 to 9, 22) | Strips the base path before checking routes, and adds it back to the login redirect (`${basePath}/login`) |
| `<Link href="/...">` | Next.js adds the base path. Four files use `next/link` |

**Steps:**

1. Set `NEXT_PUBLIC_BASE_PATH=/<sub-path>` in the build environment, then run `npm run build`. The value is read by the config and inlined into the client bundle.
2. Run `npm run start` with the same value.
3. If the app is served from another domain's path, that parent site must rewrite to this deployment. No rewrite is defined in `vercel.json`.

**Known gaps in the current code** (verified by reading the files):

| Location | Problem | Effect under a base path |
|---|---|---|
| `src/app/login/page.tsx` line 28 | Posts to `'/api/auth/login'` (or `/api/auth/register`) as a literal string, without `buildApiUrl` | The request goes to the domain root, outside the base path. Sign-in does not work |
| `src/app/login/page.tsx` line 20 | `window.location.replace('/profile')` | After a successful sign-in, the browser goes to `/profile` at the domain root |
| `src/app/api/generate-resume/route.ts` line 91 | Builds the internal call as `` `${req.nextUrl.origin}/api/resume/${style}` ``. `req.nextUrl.origin` excludes the base path | The internal request misses the base path. A non-OK response is passed through with the upstream status |

Every other client `fetch` in `src/` uses `buildApiUrl`. These three call sites do not. Patch them before running under a base path. Until then, serve the application at the root.

## 6. Dev-only browser preview (Playwright and Chromium)

The Auto Apply flow has a visible browser preview. It is a local development tool, and it is disabled in production.

**Gate** (`src/lib/auto-apply/browser-session.ts`, lines 44 to 46):

```ts
export function isVisibleBrowserEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.AUTO_APPLY_DEV_BROWSER === "true";
}
```

When the gate is closed, `startVisibleBrowserSession` returns `mode: "manual_guided"` with `reason: "browser_unavailable"` and this guidance: "Browser automation is disabled on this deployment. It is a local-development tool (AUTO_APPLY_DEV_BROWSER=true) and never runs in production."

**Launch** (`browser-session.ts`, around lines 73 to 80):

- The Playwright package is imported dynamically: `await import("playwright")`.
- `chromium.launch({ headless, args })`. `args` is `["--no-sandbox", "--disable-setuid-sandbox"]` only when headless.
- `headless` comes from `AUTO_APPLY_BROWSER_HEADLESS`: `true` means headless, `false` means headed. When neither value is set, the preview is headed, because `NODE_ENV` is not `production` inside the gate.
- The browser context uses a 1366 by 900 viewport and loads the saved storage state for the site, if one exists.
- Navigation waits up to 30 s for `domcontentloaded`. Body text is read with a 5 s timeout.

**Requirements:**

| Requirement | Detail |
|---|---|
| Browser binary | Not installed by `npm install`. `playwright/package.json` declares no install script. Run `npx playwright install chromium`. Without it, `chromium.launch` fails |
| Display | A headed window needs a graphical session. On a headless Linux host, set `AUTO_APPLY_BROWSER_HEADLESS=true` |
| Sandbox flags | The `--no-sandbox` pair is applied only in headless mode. Running as root on Linux usually needs headless mode |
| State | Sessions live in `globalThis.autoApplyBrowserSessions` (`browser-session.ts`, line 39). They do not persist across serverless invocations, as the code comment says |

**Other browser tooling** (scripts, not part of the running application):

| Command | Browser | Requirement |
|---|---|---|
| `npm run test:autofill-live` | Chromium, Firefox and WebKit, as imported by `scripts/autofill-live.ts` | Network access. The README says to run `npx playwright install firefox webkit` |
| `npm run agent:fill -- --pack <file>` | Chromium by default, using `channel: "chrome"` | Google Chrome installed. `--engine firefox` or `--engine webkit` uses Playwright's builds |
| `npm run test:autofill-safari` | Safari, through `safaridriver` | macOS, with Safari's "Allow remote automation" enabled |

## 7. Native and binary modules

| Module | Version | Used by | Handling | Notes |
|---|---|---|---|---|
| `bcrypt` | ^6.0.0 | `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts` | Webpack external, set in `next.config.ts` | Native addon. Its install script is `node-gyp-build`, which uses a prebuilt binary when one matches the platform and ABI. Otherwise a C++ toolchain is needed |
| `@napi-rs/canvas` | ^0.1.100 | `src/lib/profile-import.ts` (`createCanvas`). Imported by `/api/ocr` | `serverExternalPackages`. Linux binaries traced into `/api/ocr` | Platform-specific optional packages (11 are listed in its `package.json`). Install on the target platform |
| `pdfjs-dist` | ^4.10.38 | `src/lib/profile-import.ts` (`pdfjs-dist/legacy/build/pdf.mjs`) | `serverExternalPackages`. Worker file traced into `/api/ocr` | `engines.node >= 20`. Its optional dependency list includes `@napi-rs/canvas` |
| `mongoose` | ^8.17.2 | Database access throughout | `serverExternalPackages` | Declares `node >= 16.20.1` |
| `playwright` | ^1.60.0 | `src/lib/auto-apply/browser-session.ts` (dynamic import), `scripts/` | Browsers are not bundled (section 6) | Declares `node >= 18` |
| `pdf-lib`, `@pdf-lib/fontkit` | ^1.17.1, ^1.1.1 | PDF rendering in `src/lib/resume/pdf-renderer.ts` and `src/app/api/generate/cover-letter/pdf/route.ts` | Pure JavaScript | Fonts are read at module load (section 3.4) |
| `mammoth`, `cheerio`, `jsonwebtoken` | ^1.12.0, ^1.2.0, 9.0.3 | DOCX text, HTML parsing, JWT | Pure JavaScript | None |

## 8. Security model

### 8.1 Authentication

| Step | Code | Detail |
|---|---|---|
| Registration | `src/app/api/auth/register/route.ts` | Username must be 3 to 20 characters from `[a-zA-Z0-9_-]`. A taken username returns `409` with four suggested alternatives. The password is hashed with `bcrypt.hash(password, 10)`. The only password check is that the value is truthy |
| Sign-in | `src/app/api/auth/login/route.ts` | Finds the user by `username`, then `bcrypt.compare`. An unknown user and a wrong password both return `401 Invalid credentials` |
| Token | `src/lib/auth.ts` | JWT with payload `{ userId, username }`, signed with `JWT_SECRET` using the library default algorithm (HS256), `expiresIn: '7d'` |
| Cookie | `attachAuthCookie` in `src/lib/auth.ts` | Name `auth_token`. `HttpOnly`. `SameSite=Lax`. `Secure` only when `NODE_ENV` is `production`. `Path=/`. `Max-Age` 604800 seconds |
| Sign-out | `src/app/api/auth/logout/route.ts` | Deletes the cookie. The server keeps no session state, so a copied token stays valid until it expires |
| Verification | `getAuthFromCookies` (`src/lib/auth.ts`) | Verifies signature and expiry. Returns `null` on any failure |

### 8.2 Enforcement layers

| Layer | What it checks | What it does not check |
|---|---|---|
| Middleware (`src/middleware.ts`, re-exported by root `middleware.ts`) | Page requests. Redirects to `${basePath}/login` when the `auth_token` cookie is absent | Does not verify the JWT. Skips `/login` paths, `/api` paths, `_next/` and `favicon.ico`. Other paths, including `public/` files such as `/favicon.svg`, are redirected when unauthenticated. Fails open if the middleware throws |
| API handlers | Each handler calls `getAuthFromCookies` or `requireAutoApplyAuth` (`src/lib/auto-apply/routes.ts`, lines 9 to 13). Missing or invalid tokens return `401 {"error":"Unauthorized"}` | The routes with no auth check (section 3.2) are public: `/api/auth/login`, `/api/auth/logout`, `/api/auth/register` and `/api/test` |
| Auto Apply data access | `loadOwnedSession`, `loadOwnedJob` and `loadOwnedDraftByJob` (`src/lib/auto-apply/routes.ts`) filter queries by the signed-in user id | Other data access was not audited line by line |

### 8.3 Secrets and stored data

| Item | Detail |
|---|---|
| `JWT_SECRET` | Required. The code enforces no minimum length |
| `AUTO_APPLY_SITE_AUTH_SECRET` | Key source for remembered site credentials. Fallback chain: `AUTO_APPLY_SITE_AUTH_SECRET`, then `JWT_SECRET`, then the literal string `cv-assistant-site-auth` (`src/lib/auto-apply/site-auth.ts`, line 24). **If neither variable is set, the encryption key is derived from a string that appears in the source.** |
| Remembered credentials | AES-256-GCM with a random 12-byte IV and a 16-byte tag, stored as base64 in the site record (`encryptSiteSecret`, `decryptSiteSecret`) |
| Saved browser session | The storage state (cookies and local storage) is written as plain JSON to `.codex-data/auto-apply/site-auth/<userId>/<siteKey>.storage.json`. It is not encrypted. `saveSiteAuthState` has no error handling of its own |
| Where that storage is written | Only from the dev-only browser flow (section 6). `saveSiteAuthState` is called from `src/lib/auto-apply/browser-session.ts` (line 157) |
| Environment files | Git-ignored (`.env*`) and excluded from Vercel uploads (section 3.1) |
| User records | `username` (unique index) and `passwordHash` (required) (`src/lib/models/User.ts`) |

### 8.4 Input limits and response details

| Control | Where | Limit |
|---|---|---|
| Request size by `Content-Length` | `/api/generate/cover-letter`, `/api/generate/employer-question`, `/api/generate/clarifications` | 100,000 bytes, otherwise `413 Request too large`. Does not apply to requests without a `Content-Length` header |
| Generation text fields | `validateGenerationInput` (`src/lib/generate/validation.ts`) | Section 13.3 of the AI layer document |
| PDF import | `extractProfilePdfParts` (`src/lib/profile-import.ts`) | 12 pages. No byte limit in code |
| Sign-up username | `/api/auth/register` | 3 to 20 characters |
| Error text | Most routes return fixed messages. These routes return exception text in `500` bodies: `/api/auth/register`, `/api/ocr`, `/api/test` | Information disclosure |

### 8.5 Known gaps (observed in the code)

1. **Unchecked login and registration input types.** `/api/auth/login` passes `username` to `UserModel.findOne({ username })` without checking that it is a string. A JSON object such as `{"$ne": null}` is therefore a valid filter. The password must still match, but the query can select an account other than the one named. The repository does not enable Mongoose filter sanitisation (no `sanitizeFilter` or `strictQuery` setting exists). `/api/auth/register` has the same input handling.
2. **No password policy.** Registration accepts any truthy password, including one character.
3. **Username enumeration at registration.** A taken username returns `409` with a message that names it. Sign-in does not reveal whether a username exists.
4. **No throttling on sign-in or registration.** See section 9.
5. **Unauthenticated diagnostics.** `GET /api/test` opens the database connection and returns the exception text on failure. Consider removing it or restricting it before exposing the application publicly.
6. **No CSRF tokens.** `SameSite=Lax` on the cookie is the only protection in code.
7. **No security headers or CORS policy** in `next.config.ts` or middleware. Any headers must come from the platform.
8. **Predictable fallback key** for remembered credentials (section 8.3).

## 9. Rate limiting

**Not implemented.** No rate-limiting package appears in `package.json`. No handler returns `429`. Searches for "rate", "throttle", "lockout" and "brute" in `src/` find only:

- NVIDIA NIM handling of upstream `429` responses. These are cooldowns on outbound calls (`src/lib/ai.ts`, section 6 of the AI layer document).
- Job-board handling of `403` and `429` responses from scraped sites (`src/lib/search/server/utils.ts`, `src/lib/search/server/sources.ts`).
- Input validation messages such as `Too many items selected` in the style routes. These are input checks, not rate limits.

The root README lists rate limiting as "recommended for production". It is not in the code. If inbound rate limits are needed, they must be added in code or configured at the platform. Nothing in this repository configures them.

## 10. Operations

### 10.1 In-process state

Each process or serverless instance holds its own copy of:

| State | Location | Effect of a restart |
|---|---|---|
| NIM key state and cooldowns | `src/lib/ai.ts` (`keyStates`, `modelKeyStates`) | Cooldowns and disabled keys are forgotten |
| Visible browser sessions | `globalThis.autoApplyBrowserSessions` (`src/lib/auto-apply/browser-session.ts`) | Sessions are lost |
| MongoDB connection | `global.mongoose` (`src/lib/db.ts`) | Reconnects on the next request |

`src/lib/db.ts` stores the connection promise and never clears it after a failure. A single failed connection therefore makes every later database call on that instance fail, until the process restarts or the instance is replaced (section 11).

### 10.2 Startup log

`src/instrumentation.ts` runs when the Node.js runtime starts. It logs one of:

```text
NVIDIA NIM: 3 distinct API keys configured.
NVIDIA NIM: no API keys are configured; AI features will be unavailable.
```

### 10.3 Logs to look for

| Message | Source | Meaning |
|---|---|---|
| `Cover letter generation failed on all models` | `/api/generate/cover-letter` | Every fallback failed. The error is logged with it |
| `Employer question generation failed on all models` | `/api/generate/employer-question` | As above |
| `Advanced cover letter generation failed, falling back to standard mode` | `/api/generate/cover-letter` | Advanced mode failed; the standard path ran |
| `Clarification question generation unavailable` | `/api/generate/clarifications` | The decision step failed. The response is `unavailable: true` |
| `Unable to load profile for generation` | Generation routes | Database read failed. The response is `503` |
| `Register error:` | `/api/auth/register` | Logs the exception before the `500` response |
| `NVIDIA NIM ...` error messages | `src/lib/ai.ts` (section 11 of the AI layer document) | Upstream and transport failures |

### 10.4 Health check

`GET /api/test` returns `{"status":"ok","message":"MongoDB connected"}` with `200`, or `{"status":"error","message":"<exception text>"}` with `500`. It requires no sign-in (section 8.5).

### 10.5 Long-running work

Auto Apply pipelines run in `after()` callbacks (section 3.3). Their state is in the `AutoApplySession` document (`run.phase`, `run.message`, `run.updatedAt`, `run.stats`). Clients poll `GET /api/auto-apply/session/[id]`.

## 11. Troubleshooting

Each row cites the code that produces the symptom. Status codes and messages are exact.

| Symptom | Where it comes from | Likely cause | What to do |
|---|---|---|---|
| Sign-in returns `500 {"error":"Server error"}` | `src/app/api/auth/login/route.ts`, catch block | Any exception: missing `MONGO_URI` or `JWT_SECRET`, unreachable MongoDB, or a bcrypt load failure | Set both variables for this environment. Check the function log |
| Registration returns `500` with text such as `Missing MONGO_URI in environment` | `src/app/api/auth/register/route.ts`, catch block returns `error.message` | Same as above | Same as above |
| Signed-in requests return `401 {"error":"Unauthorized"}` after sign-in | `getAuthFromCookies` returns `null` when `verifyAuthToken` fails. Verification swallows the error for a missing secret | `JWT_SECRET` is missing, or differs between instances, or was changed | Use one `JWT_SECRET` per environment. Sign in again after a change |
| Sign-in appears to succeed, then the browser returns to `/login` | `src/middleware.ts` redirects when `auth_token` is missing | The browser did not keep the `Secure` cookie. Browsers store `Secure` cookies only over HTTPS, with `localhost` as the usual exception | Serve over HTTPS. Check the cookie in the browser's developer tools |
| `Missing JWT_SECRET in environment` in logs | `signAuthToken` in `src/lib/auth.ts` | Sign-in or registration without a secret | Set `JWT_SECRET` |
| `Missing MONGO_URI in environment` in logs | `getMongoUri` in `src/lib/db.ts` | Variable not set | Set `MONGO_URI` |
| Every database call fails after one failure | `src/lib/db.ts` keeps the rejected promise in `global.mongoose.promise` | A single failed connection is cached for the life of the instance | Fix the connection and restart or redeploy the instance |
| `NVIDIA NIM: no API keys are configured; AI features will be unavailable.` at startup | `src/instrumentation.ts` | No `NVIDIA_NIM_API_KEY_1` to `_9` set | Set at least one key |
| `No NVIDIA NIM API keys configured (NVIDIA_NIM_API_KEY_1 through NVIDIA_NIM_API_KEY_9)` | `createResponse` in `src/lib/ai.ts` | Same | Same |
| Generation returns `502` with `Cover letter generation temporarily unavailable. Please try again.` | `/api/generate/cover-letter` after all fallbacks fail | Every model and key failed or cooled down | Read the `NVIDIA NIM ...` messages in the log (AI layer document, section 11). Check key validity, quota and model availability |
| Generation returns `504` with `Generation timed out. Please try again.` | Generation routes when the 240 s request signal fires | Model latency or retries exceed the budget | Check model choice, `NVIDIA_NIM_TIMEOUT_S` and the platform duration limit |
| `NVIDIA NIM request timed out` or `NVIDIA NIM request timed out or disconnected` in logs | `createResponse` and `requestModel` in `src/lib/ai.ts` | The overall budget, or an idle or first-token limit, was exceeded | Check upstream latency. Change timeouts with care |
| `NVIDIA NIM response did not finish normally (length)` | `readStream` in `src/lib/ai.ts` | Output reached `max_tokens` | Request less output, or raise `NVIDIA_NIM_MAX_TOKENS`. The per-model caps still apply |
| `NVIDIA NIM does not accept <mime> as chat input` | `mapMessages` | A non-image attachment reached the model | Only images are sent. Profile import renders PDF pages to JPEG |
| Clarification response is `{"questions":[],"unavailable":true}` with status `200` | `/api/generate/clarifications`, catch block | Model failure, or the 50 s budget elapsed | Read the log line `Clarification question generation unavailable`. The step is optional, so drafting can continue |
| `The cover letter agent returned nothing. Try again.` (`502`) | `/api/auto-apply/job/[jobId]/cover-letter` | `runCoverLetterAgent` returned empty text | Retry. Check model availability |
| `We could not complete the evidence check. Please review all personal claims before submitting.` | `checkDraftClaims` in `src/lib/generate/claim-check.ts` | The 18 s review failed or timed out. The review is advisory and never blocks a draft | Expected under load. Review the draft yourself |
| `Cover letter generation failed: <message>.` in an Auto Apply job's warnings | `src/lib/auto-apply/prepare.ts` | `runCoverLetterAgent` threw | Read the message. Retry the job |
| `Please upload a PDF with no more than 12 pages.` | `extractProfilePdfParts`, returned by `/api/ocr` with status `500` | Page limit | Upload fewer pages. The status is `500`, not `4xx` |
| `Unsupported file type. Please upload a PDF or DOCX file.` | `parseProfileImportFromFile`, returned by `/api/ocr` with status `500` | Wrong file type. The route returns `500` for every error | Upload PDF or DOCX. Treat the status as a client error |
| `Could not read the PDF. Please upload a valid, unprotected PDF or a DOCX file.` | `extractProfilePdfParts`, returned by `/api/ocr` with status `500` | pdf.js could not read the file, or it is protected | Use a valid, unprotected file |
| `No text provided` or `No file` (`400`) | `/api/ocr` | Empty JSON text, or no multipart `file` field | Send the expected payload |
| `Request too large` (`413`) | Generation and clarification routes | `Content-Length` above 100,000 bytes | Shorten the input |
| `Missing inputs`, `Missing question`, `Input too long`, `Invalid evidence selection` (`400`) | `validateGenerationInput` and the generation routes | Missing or over-long fields, or indices out of range | Section 13.3 of the AI layer document |
| `A run is already in progress for this session.` (`409`) | `claimRun` in `src/lib/auto-apply/engine.ts` | Another run holds the lock, and its heartbeat is recent | Wait for the stall window (150 s), then retry |
| `Select at least one role first.` (`400`) | `/api/auto-apply/session/[id]/run`, prepare mode | No job has the `selected` status | Select roles first |
| `Session not found.` (`404`) | `/api/auto-apply/session/[id]/run` | Unknown session, or owned by another user | Check the session and the sign-in |
| Auto Apply run stays in "preparing" | `run.updatedAt` stops moving when the heartbeat stops | The function was cut off, possibly at the 300 s limit | Retry after 150 s. If it repeats, check the function duration and logs |
| `Browser automation is disabled on this deployment...` (`reason: browser_unavailable`) | `src/lib/auto-apply/browser-session.ts` | `AUTO_APPLY_DEV_BROWSER` is not `true`, or `NODE_ENV` is `production` | Expected in production. For local work, set `AUTO_APPLY_DEV_BROWSER=true` and use `npm run dev` |
| Browser preview does not launch | Playwright `chromium.launch` | Chromium not installed, or headed mode on a host without a display | Run `npx playwright install chromium`. Set `AUTO_APPLY_BROWSER_HEADLESS=true` on a headless host |
| Login or sign-up fails under a base path | `src/app/login/page.tsx` (lines 20 and 28) | Known gap (section 5) | Patch the login form and redirect to use the base path |
| Resume PDF generation fails under a base path | `src/app/api/generate-resume/route.ts` (line 91) | Known gap (section 5) | Patch the internal URL to include the base path |
| `GET /api/test` returns `500` with `{"status":"error",...}` | `src/app/api/test/route.ts` | Database connection failed | Read the `message`, fix the connection, redeploy |
| Resume PDF routes fail at load time | `src/app/api/resume/embed-noto-sans-fonts.ts` reads fonts at module load | `public/fonts/NotoSans-*.ttf` missing from the function bundle. Not verified on Vercel | Check the deployed bundle with a request to `/api/resume/style1` on a preview deployment |

## 12. Corrections to the root README

The root `README.md` (one level above `cv-assistant/`) makes several claims that the repository does not support. This document does not repeat them.

| README claim | What the repository shows |
|---|---|
| A Docker example (`Docker (Optional)`) | No Dockerfile or container configuration exists |
| "Rate limiting (recommended for production)" | Not implemented (section 9) |
| "MongoDB injection protection" | Not implemented. The sign-in input is not type-checked (section 8.5) |
| `npm run eval:letters` "needs `NVIDIA_API_KEY` in `.env`" | The code reads `NVIDIA_NIM_API_KEY_1` to `_9` (`evals/run-letter.ts` and `src/lib/ai.ts`) |
| Node.js 22 | Stated only in the README. No `engines` field or `.nvmrc` enforces it. The lowest version that satisfies every declared engine is 20 |
| Vercel deployment steps | They do not mention the Root Directory, which must be `cv-assistant` (section 3.1) |
