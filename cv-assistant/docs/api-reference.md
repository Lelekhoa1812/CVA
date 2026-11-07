# CV Assistant API reference

This document describes the HTTP API of the CV Assistant (CVA) app. It covers the 47 route handlers under `cv-assistant/src/app/api/**/route.ts`. Every behaviour described here was taken from the source at commit `96a9343` on `main`. Where a statement rests on a code path that was read but not executed, the text says so. The API section of the root `README.md` is out of date and should not be used as a reference.

Examples assume `npm run dev`, the app on `http://localhost:3000`, and `NEXT_PUBLIC_BASE_PATH` unset. Placeholder values such as `demo_user`, `your-password` and `<session-id>` must be replaced before use.

## Contents

1. [Conventions](#1-conventions)
2. [Route summary](#2-route-summary)
3. [Routes](#3-routes)
4. [Known gaps and observations](#4-known-gaps-and-observations)
5. [Routes by AI tier and cost](#5-routes-by-ai-tier-and-cost)

## 1. Conventions

### 1.1 Base URL and base path

- Routes are served under `/api/...` on the app origin. The examples use `http://localhost:3000`.
- `next.config.ts` reads `NEXT_PUBLIC_BASE_PATH`, trims trailing slashes, adds a leading slash if one is missing, and passes the result to Next.js as `basePath`. With `NEXT_PUBLIC_BASE_PATH=/cva`, every route moves to `/cva/api/...`.
- One route builds an internal URL without the base path. See [Known gaps](#4-known-gaps-and-observations), item 4.

### 1.2 Authentication

Authentication is cookie-based. There are no bearer tokens and no API keys.

| Item | Value |
|---|---|
| Cookie name | `auth_token` |
| Token | JWT signed with `JWT_SECRET` (HS256, the `jsonwebtoken` default) |
| Payload | `{ "userId": "<Mongo ObjectId as string>", "username": "<username>" }` |
| Lifetime | 7 days (`expiresIn: '7d'`) |
| Cookie attributes | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`, `Secure` only when `NODE_ENV=production` |

- `POST /api/auth/login` and `POST /api/auth/register` set the cookie. `POST /api/auth/logout` clears it.
- Verification is done per route. `getAuthFromCookies` in `src/lib/auth.ts` reads the cookie and verifies the token. Auto Apply routes call `requireAutoApplyAuth` in `src/lib/auto-apply/routes.ts`, which wraps the same check.
- A missing or invalid token returns `401` with the body `{"error":"Unauthorized"}`.
- If `JWT_SECRET` is not set, token verification fails and returns `null`, so authenticated routes return `401`. Login and register call the signing function directly, which throws, so they return `500`.
- Logout only clears the cookie. There is no server-side session store and no revocation, so a copied token stays valid until it expires.
- Authorisation is ownership only. Every query filters on the `userId` from the token, so another user's IDs return `404`.
- Routes with no auth check: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/register` and `GET /api/test`.

### 1.3 Middleware

- `src/middleware.ts` is re-exported by the root `middleware.ts`. Its matcher covers every path except `_next/*` and `favicon.ico`.
- Paths under `/api` (after the base path is removed) pass straight through. The middleware does not check the token for API routes.
- For page paths, the middleware only checks that an `auth_token` cookie exists. If it does not, the request is redirected to `${basePath}/login`. The JWT is not verified there. `/login` is always allowed.
- Any exception inside the middleware lets the request through (fail-open).

### 1.4 Request and response formats

- Requests are JSON (`Content-Type: application/json`) unless noted. `POST /api/ocr` also accepts `multipart/form-data` with a `file` field.
- Responses are JSON unless noted.
- PDF responses use `Content-Type: application/pdf`. They come from `POST /api/resume/style1` to `style5`, `POST /api/generate-resume`, and `POST /api/generate/cover-letter/pdf`.
- `POST /api/search/jobs/stream` returns newline-delimited JSON (`application/x-ndjson; charset=utf-8`, `Cache-Control: no-cache, no-transform`). Each line is one JSON event. There is no server-sent events or WebSocket support.
- Auto Apply pipeline work is not streamed. `POST /api/auto-apply/session/[id]/run` returns `202`, and clients poll `GET /api/auto-apply/session/[id]`.
- If an exception is thrown outside a `try` block, Next.js returns its default `500` response. That response is not the JSON error envelope. Affected routes are listed in [Known gaps](#4-known-gaps-and-observations), item 3.

### 1.5 Errors

Most routes return one envelope:

```json
{ "error": "Missing username or password" }
```

The HTTP status carries the category. These routes differ from the envelope:

| Route | Response shape |
|---|---|
| `POST /api/auth/register` (409) | `{ "error": "...", "suggestions": ["..."] }` |
| `POST /api/generate/clarifications` | `200` with `{ "questions": [], "unavailable": true }` when AI fails |
| `POST /api/resume/enhance-targeted` (500) | `{ "error": "Failed to enhance content", "fallback": "<original text>" }` |
| `POST /api/resume/coach` | `200` with a canned question when AI fails |
| `POST /api/resume/style-parser` | `200` with default preferences when the AI call or JSON parse fails |
| `POST /api/auto-apply/job/[jobId]/prepare` (502) | `{ "error": "...", "outcome": "failed" }` |
| `GET /api/test` | `{ "status": "ok", "message": "..." }` or `{ "status": "error", "message": "..." }` |
| `POST /api/search/jobs/stream` | JSON `{ "error": "..." }` before streaming starts. After it starts, errors are NDJSON lines of type `error`, sent with HTTP `200`. |

Validation messages come from two sources. Zod routes return the first Zod issue message in some places and a fixed string in others. Each route section states which applies.

### 1.6 Validation

- zod v4 validates Auto Apply session create and update, Auto Apply job PATCH, Auto Apply preferences PUT, the search stream (`searchRequestSchema`), search advanced (a partial of the same schema), and generate-resume (`requestSchema`).
- Other routes use hand-written checks (`typeof` tests, trimming, and length limits). The shared limits for generation are in `src/lib/generate/validation.ts`.
- Several routes do not validate their input at all. Each affected route section says so.

### 1.7 Runtime, duration and streaming

- `runtime = "nodejs"` and `dynamic = "force-dynamic"` are set on every Auto Apply route, every control room route, every search route, and `POST /api/ocr`.
- The remaining routes (auth, profile, enhance, generate, generate-resume, resume, and test) set neither export. They use the Next.js defaults. They read cookies or the request body, so they are dynamic in practice.
- `maxDuration = 300` is set on three routes only: `auto-apply/session/[id]/run`, `auto-apply/job/[jobId]/prepare` and `auto-apply/job/[jobId]/cover-letter`.
- `vercel.json` sets build, dev and install commands only. It has no `functions` block, so other routes use the platform default.
- Internal timeouts in the code:

| Operation | Timeout |
|---|---|
| Generate cover letter and employer answer (overall) | 240 s |
| Generate clarifications | 50 s |
| Auto Apply cover letter rewrite | 250 s |
| Auto Apply pipeline run budget (`RUN_BUDGET_MS`) | 270 s |
| Visible browser guidance model call | 60 s |
| Lead detail fetch during enrichment | 10 s |

- NVIDIA NIM timeouts come from environment variables. See 1.8.
- `after()` from `next/server` lets the Auto Apply run and prepare-only work continue after the `202` response is sent.

### 1.8 Environment variables read by the API

| Variable | Read by | Purpose |
|---|---|---|
| `MONGO_URI` | `src/lib/db.ts` | Required. The database name is fixed as `cv_assistant`. |
| `JWT_SECRET` | `src/lib/auth.ts` | Required for every authenticated route and for login and register. |
| `NEXT_PUBLIC_BASE_PATH` | `next.config.ts` | Optional mount path for the app. |
| `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` | `src/lib/ai.ts`, `src/instrumentation.ts` | At least one key is needed for any AI route. Startup logs how many distinct keys are configured. |
| `AUTO_APPLY_DEV_BROWSER` | `src/lib/auto-apply/browser-session.ts` | Must be `true`, and `NODE_ENV` must not be `production`, for the browser routes to work. |
| `AUTO_APPLY_BROWSER_HEADLESS` | `src/lib/auto-apply/browser-session.ts` | `true` forces headless mode and `false` forces headed mode. |
| `AUTO_APPLY_SITE_AUTH_SECRET` | `src/lib/auto-apply/site-auth.ts` | Key for encrypting saved site credentials. Falls back to `JWT_SECRET`, then to a fixed string. See Known gaps. |
| `CONTROL_ROOM_STRATEGIST_MODE` | `src/lib/career/career-strategist.ts` | Set to `heuristic` to skip the LLM strategist and use the heuristic scorer only. |
| `NVIDIA_NIM_*` (models, base URL, timeouts, max tokens) | `src/lib/ai.ts` | Configure the AI layer. See `ai-layer.md` in this folder. |

### 1.9 Not implemented

- There are no CORS headers and no `OPTIONS` handlers. Browsers can only call the API from the app's own origin.
- There is no rate limiting, no request ID header, and no API versioning.
- List endpoints have fixed limits, not paging parameters. Sessions return up to 20. Session events return up to 40 in the session workspace or up to 100 from the events endpoint.

## 2. Route summary

All 47 route files are listed. `maxDuration` is the segment config value in seconds. A dash means no export is set.

| Method | Path | Auth | Purpose | maxDuration |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | No | Sign in and set the `auth_token` cookie | - |
| `POST` | `/api/auth/logout` | No | Clear the `auth_token` cookie | - |
| `POST` | `/api/auth/register` | No | Create an account and sign in | - |
| `GET`, `PUT` | `/api/profile` | Yes | Read or replace the candidate profile | - |
| `POST` | `/api/ocr` | Yes | Import a candidate profile from pasted text, a PDF or a DOCX | - |
| `POST` | `/api/enhance` | Yes | Enhance or explore a skills or profile section, or rewrite an item description | - |
| `POST` | `/api/generate/clarifications` | Yes | Propose 2 to 5 questions before drafting | - |
| `POST` | `/api/generate/cover-letter` | Yes | Generate a cover letter | - |
| `POST` | `/api/generate/employer-question` | Yes | Answer an employer question | - |
| `POST` | `/api/generate/select` | Yes | Rank profile evidence against a job description | - |
| `POST` | `/api/generate/cover-letter/pdf` | Yes | Render a cover letter as a PDF of at most 512 KB | - |
| `POST` | `/api/generate-resume` | Yes | Build a resume PDF, optionally with AI coaching | - |
| `POST` | `/api/resume/style1` | Yes | Resume PDF, Style 1 (Harvard) | - |
| `POST` | `/api/resume/style2` | Yes | Resume PDF, Style 2 (Chronological) | - |
| `POST` | `/api/resume/style3` | Yes | Resume PDF, Style 3 (Modernised) | - |
| `POST` | `/api/resume/style4` | Yes | Resume PDF, Style 4 (Creative) | - |
| `POST` | `/api/resume/style5` | Yes | Resume PDF, Style 5 (Ledger) | - |
| `POST` | `/api/resume/beautify` | Yes | Add Markdown emphasis without changing facts | - |
| `POST` | `/api/resume/coach` | Yes | One turn of the content coaching agent | - |
| `POST` | `/api/resume/enhance` | Yes | Expand resume content by about 50% | - |
| `POST` | `/api/resume/enhance-targeted` | Yes | Rewrite one resume item to stated preferences | - |
| `POST` | `/api/resume/style-parser` | Yes | Turn a free-text styling answer into style settings | - |
| `POST` | `/api/resume/summarize` | Yes | Shorten resume content by about 50% | - |
| `POST` | `/api/search/advanced` | Yes | Plan 2 to 5 refinement questions for a search | - |
| `POST` | `/api/search/advanced-sequential` | Yes | Return the next single refinement question | - |
| `POST` | `/api/search/jobs/stream` | Yes | Stream job search results as NDJSON | - |
| `GET`, `POST` | `/api/auto-apply/session` | Yes | List recent sessions, or create one | - |
| `GET`, `PATCH` | `/api/auto-apply/session/[id]` | Yes | Session workspace, or update session settings | - |
| `POST` | `/api/auto-apply/session/[id]/run` | Yes | Start the pipeline, or prepare the selected roles | 300 |
| `POST` | `/api/auto-apply/session/[id]/cancel` | Yes | Request that a run stops | - |
| `GET` | `/api/auto-apply/session/[id]/events` | Yes | Last 100 events for a session | - |
| `POST` | `/api/auto-apply/session/[id]/refresh-answers` | Yes | Apply standing answers to open applications | - |
| `POST` | `/api/auto-apply/session/[id]/approve` | Yes | Approve, or withdraw approval for, prepared applications | - |
| `GET`, `PATCH` | `/api/auto-apply/job/[jobId]` | Yes | Application detail, or stage and answer edits | - |
| `POST` | `/api/auto-apply/job/[jobId]/prepare` | Yes | Prepare one application | 300 |
| `POST` | `/api/auto-apply/job/[jobId]/cover-letter` | Yes | Rewrite the cover letter for one application | 300 |
| `POST` | `/api/auto-apply/job/[jobId]/applied` | Yes | Record that the candidate submitted, or undo that record | - |
| `GET` | `/api/auto-apply/job/[jobId]/pack` | Yes | Autofill pack as JSON and plain text | - |
| `POST` | `/api/auto-apply/job/[jobId]/browser/start` | Yes | Start the visible browser (local development only) | - |
| `POST` | `/api/auto-apply/job/[jobId]/browser/action` | Yes | Run one browser action (local development only) | - |
| `GET`, `PUT` | `/api/auto-apply/preferences` | Yes | Read or replace applicant preferences | - |
| `POST` | `/api/auto-apply/profile-draft` | Yes | Draft Auto Apply settings from the profile | - |
| `GET` | `/api/control-room/overview` | Yes | Pipeline overview and strategist digest | - |
| `GET`, `PATCH` | `/api/control-room/context` | Yes | Read or update the user context snapshot | - |
| `GET` | `/api/control-room/leads/[leadId]` | Yes | Lead detail | - |
| `POST` | `/api/control-room/leads/[leadId]/orchestrate` | Yes | Enrich, score and, if the lead is worth it, tailor documents | - |
| `GET` | `/api/test` | No | MongoDB connectivity check. See section 3.11 for a production-safety verdict. | - |

## 3. Routes

Each subsection lists the exports, the auth requirement, the request fields with types and whether they are required, validation limits, the success response, status codes with the exact error strings, side effects, and an example. Error strings are quoted exactly as the code returns them.

### 3.1 Auth

#### `POST /api/auth/login`

- **Exports:** `POST`
- **Auth:** none
- **Runtime:** Next.js default

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | Not type-checked. A non-string value reaches the database query. See Known gaps, item 1. |
| `password` | string | yes | Compared with bcrypt against the stored `passwordHash`. |

**Validation:** presence only (`!username || !password`).

**Success: `200`**

```json
{ "ok": true }
```

The response sets the `auth_token` cookie (see 1.2). The body contains no user details.

**Errors**

- `400` `Missing username or password`
- `401` `Invalid credentials` (an unknown username and a wrong password return the same message)
- `500` `Server error` (malformed JSON, database failure, or missing `JWT_SECRET`)

**Side effects:** one User read by username. No writes. No AI calls.

**Example**

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo_user","password":"your-password"}'
```

#### `POST /api/auth/logout`

- **Exports:** `POST`
- **Auth:** none
- **Request body:** none

**Success: `200`**

```json
{ "ok": true }
```

The `auth_token` cookie is expired in the response.

**Errors:** none. The handler has no `try` block.

**Side effects:** none.

**Example**

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
```

#### `POST /api/auth/register`

- **Exports:** `POST`
- **Auth:** none
- **Runtime:** Next.js default

**Request body (JSON)**

| Field | Type | Required | Rules |
|---|---|---|---|
| `username` | string | yes | 3 to 20 characters. Letters, digits, hyphen and underscore only. Uniqueness is case-sensitive, so `Demo_User` and `demo_user` are different accounts. |
| `password` | string | yes | No length or complexity rule. |

**Validation order**

1. Missing `username` or `password` returns `400` `Missing username or password`.
2. An existing username returns `409` with `suggestions` (checked before the format rules).
3. Fewer than 3 characters returns `400` `Username must be at least 3 characters long`.
4. More than 20 characters returns `400` `Username must be no more than 20 characters long`.
5. Characters outside the allowed set return `400` `Username can only contain letters, numbers, hyphens, and underscores`.

**Success: `200`**

```json
{ "ok": true }
```

The response sets the `auth_token` cookie.

**Errors**

- `400` (messages above)
- `409` `Username "<username>" is already taken. Please choose a different username.` The response also has a `suggestions` array of four strings: `<username>123`, `<username>_<0 to 999>`, `<username><last two digits of the year>`, and `<username><three random base-36 characters>`.
- `500` `{ "error": "<error.message>" }`. The raw exception message is returned to the client.

**Side effects:** one User write (create) with a bcrypt hash at cost 10. The profile starts with the schema defaults. The handler logs progress and the new user ID to the server console. No AI calls.

**Example**

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo_user","password":"your-password"}'
```

Example `409` response:

```json
{
  "error": "Username \"demo_user\" is already taken. Please choose a different username.",
  "suggestions": ["demo_user123", "demo_user_482", "demo_user26", "demo_userk3x"]
}
```

### 3.2 Profile

#### `GET /api/profile`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "profile": {
    "name": "Jordan Example",
    "major": "",
    "school": "",
    "studyPeriod": "",
    "email": "jordan@example.com",
    "workEmail": "",
    "phone": "",
    "website": "",
    "linkedin": "",
    "profileSummary": "",
    "skills": "TypeScript, Node.js, PostgreSQL",
    "languages": "English",
    "projects": [],
    "experiences": [
      {
        "_id": "66a1f0c2e4b0a1b2c3d4e5f6",
        "companyName": "Example Pty Ltd",
        "role": "Software Engineer",
        "location": "Melbourne, VIC",
        "timeFrom": "Jan 2022",
        "timeTo": "Present",
        "description": "Built internal tooling for the operations team.",
        "summary": "Built internal operations tooling in TypeScript.",
        "createdAt": "2024-05-01T00:00:00.000Z",
        "updatedAt": "2024-05-01T00:00:00.000Z",
        "normalizedTimeTo": "Present",
        "normalizedTimeToSortKey": 4102444800000,
        "normalizedTimeToIsPresent": true,
        "normalizedTimeToSource": "timeTo"
      }
    ]
  }
}
```

- Projects are sorted by `createdAt`, newest first.
- Experiences are sorted by recency. The `normalizedTime*` fields are derived when the profile is written and are returned as stored.
- If the user has no profile, `profile` is `null`. A user document that cannot be found also returns `200` with `profile: null`, not `404`.

**Errors:** `401` `Unauthorized`. A database failure is not caught and returns the framework `500`.

**Side effects:** none.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/profile
```

#### `PUT /api/profile`

- **Exports:** `PUT`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Behaviour |
|---|---|---|---|
| `name`, `major`, `school`, `studyPeriod`, `email`, `workEmail`, `phone`, `website`, `linkedin`, `profileSummary`, `skills`, `languages` | string | no | Omitted keeps the stored value. A non-string value is stored as an empty string. Values are neither trimmed nor length-limited. |
| `projects` | array | no | Omitted keeps the stored list. A provided array replaces the stored list. A non-array value is treated as an empty array, which deletes every project. |
| `experiences` | array | no | As for `projects`. A non-array value deletes every experience. Send the complete list every time. |

Project items: `_id` (optional, matches a stored project), `name`, `description`, `summary` (kept only when no new summary is generated), `createdAt`, and `_needsSummary` (boolean).

Experience items: `_id` (optional), `companyName`, `role`, `location`, `timeFrom`, `timeTo`, `description`, `summary`, `createdAt`, `updatedAt`, and `_needsSummary` (boolean).

**Matching:** an item with an `_id` matches the stored item with that ID. An experience without a usable ID falls back to a match on company, role, `timeFrom` and `timeTo`, compared case-insensitively.

**Summaries:** a project or experience gets a new summary when `_needsSummary` is true, when it has no stored summary, or when its content has changed. The summary is one or two sentences from the `easy` tier. An experience's `updatedAt` is set to the current time when its content changes.

**Success: `200`**

```json
{
  "ok": true,
  "profile": { "name": "Jordan Example", "skills": "TypeScript, Node.js, PostgreSQL", "projects": [], "experiences": [] }
}
```

The `profile` object has the same shape as `GET /api/profile`. The example is shortened. If nothing has changed, the response is returned without a write.

**Errors**

- `401` `Unauthorized`
- `404` `User not found`
- Malformed JSON, a database failure, or a failed summary call is not caught and returns the framework `500`.

**Side effects:** one `findByIdAndUpdate` that `$set`s only the changed `profile.*` fields. One `easy` AI call for each project or experience whose summary is refreshed.

**Example**

```bash
curl -s -b cookies.txt -X PUT http://localhost:3000/api/profile \
  -H 'Content-Type: application/json' \
  -d '{"skills":"TypeScript, Node.js, PostgreSQL","experiences":[{"companyName":"Example Pty Ltd","role":"Software Engineer","location":"Melbourne, VIC","timeFrom":"Jan 2022","timeTo":"Present","description":"Built internal tooling for the operations team."}]}'
```

### 3.3 OCR and profile import

#### `POST /api/ocr`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`

The branch is chosen by the `Content-Type` header.

**Request**

| Branch | Content type | Field | Required | Notes |
|---|---|---|---|---|
| Text | `application/json` | `text` (string) | yes | Must not be empty after trimming. |
| File | any other type, read as form data | `file` (file upload) | yes | PDF or DOCX. The type is detected from the file name and MIME type. |

**Limits and processing**

- PDFs with more than 12 pages are rejected.
- Each PDF page is read as text. A page with fewer than 100 characters of text, or one that contains image content, is also rendered to a JPEG (scale up to 2, longest side up to 1800 px, quality 85) and sent to the model.
- DOCX text is extracted locally.
- The route sets no file size limit. Hosting platform limits apply.

**Success: `200`**

```json
{
  "data": {
    "name": "Jordan Example",
    "email": "jordan@example.com",
    "skills": "TypeScript, Node.js, PostgreSQL",
    "experiences": [
      {
        "companyName": "Example Pty Ltd",
        "role": "Software Engineer",
        "location": "Melbourne, VIC",
        "timeFrom": "Jan 2022",
        "timeTo": "Present",
        "description": "Built internal tooling for the operations team."
      }
    ],
    "projects": []
  }
}
```

The `data` object is the normalised candidate profile. The example is illustrative. Nothing is saved; the caller decides whether to store it through `PUT /api/profile`.

**Errors**

- `401` `Unauthorized`
- `400` `No text provided` (JSON branch, empty text)
- `400` `No file` (form branch without a `file` field)
- `500` `Unsupported file type. Please upload a PDF or DOCX file.`
- `500` `Please upload a PDF with no more than 12 pages.`
- `500` `Could not read the PDF. Please upload a valid, unprotected PDF or a DOCX file.`
- `500` `Failed to parse profile import JSON: <last parser error>` (model output was not usable JSON after three attempts)
- `500` with the raw message of any other exception, or `Failed to parse import` when the exception has no message

The file errors use status `500`, not a `4xx`. See Known gaps, item 15.

**Side effects:** no database access. The `document` AI tier is called once per attempt, up to three attempts per request.

**Examples**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/ocr \
  -H 'Content-Type: application/json' \
  -d '{"text":"Jordan Example\nSoftware Engineer, Example Pty Ltd, Melbourne VIC, Jan 2022 to present\nBuilt internal tooling for the operations team."}'
```

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/ocr \
  -F 'file=@/path/to/cv.pdf'
```

### 3.4 Enhance

#### `POST /api/enhance`

- **Exports:** `POST`
- **Auth:** yes

This route is separate from `POST /api/resume/enhance` (section 3.7).

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `skills` or `profile` select the section path. Any other value, such as `project` or `experience`, selects the bullet rewrite. |
| `name` | string | yes | Used in the bullet rewrite prompt. |
| `description` | string | conditional | Required for bullet rewrites and for `enhance` mode. |
| `mode` | `"enhance"` or `"explore"` | no | Defaults to `enhance`. Applies to `skills` and `profile` only. |
| `context` | object | conditional | Required in `explore` mode. Holds `major`, `school`, `studyPeriod`, `skills`, `projects` and `experiences`. |

**Validation:** `type` and `name` must be truthy. In `explore` mode, the context must contain evidence (`hasTextSectionExploreEvidence`). In `enhance` mode, `description` must be non-empty.

**Success: `200`**

```json
{
  "enhancedDescription": "Designed and shipped internal tooling that cut weekly reporting time for the operations team.",
  "message": "project description enhanced successfully"
}
```

For the section path the message is `<type> content generated successfully` in explore mode and `<type> content enhanced successfully` in enhance mode.

**Errors**

- `401` `Unauthorized`
- `400` `Missing required fields`
- `400` `Missing education, project, or experience context` (explore mode without evidence)
- `500` `Failed to enhance description` (any AI failure, which is also logged)
- Malformed JSON is read outside the `try` block and returns the framework `500`.

**Side effects:** none. One `hard` AI call per request.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/enhance \
  -H 'Content-Type: application/json' \
  -d '{"type":"project","name":"Ops reporting tool","description":"Built a script that pulls weekly data and writes a report."}'
```

### 3.5 Generate

The routes under `/api/generate/` share the limits in `src/lib/generate/validation.ts`:

| Input | Limit | Rejected with |
|---|---|---|
| `company` | 300 characters | `400` `Input too long` |
| `jobDescription` | 18,000 characters | `400` `Input too long` |
| `question` | 4,000 characters | `400` `Input too long` |
| `idealWordCount` (employer question) | 100 characters | `400` `Input too long` |
| `answerStyle` (employer question) | 300 characters | `400` `Input too long` |
| `indices` | at most 30 entries, each a non-negative safe integer | `400` `Invalid evidence selection` |

`indices` refer to positions in the evidence list built by `getCoverLetterItems`, which puts projects first and then experiences. An index at or beyond the length of that list also returns `400` `Invalid evidence selection`.

`POST /api/generate/clarifications`, `POST /api/generate/cover-letter` and `POST /api/generate/employer-question` return `413` `Request too large` when the `Content-Length` header is above 100,000 bytes. The check reads the header only.

#### `POST /api/generate/clarifications`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `"cover-letter"` or `"employer-question"` | yes | Any other value returns `400` `Missing inputs`. |
| `company` | string | yes for `cover-letter` | Trimmed. |
| `jobDescription` | string | yes for `cover-letter` | Trimmed. |
| `question` | string | yes for `employer-question` | Trimmed. |
| `answerStyle` | string | no | Trimmed and cut to 300 characters. Not rejected when longer. |
| `idealWordCount` | string | no | Trimmed and cut to 100 characters. Not rejected when longer. |
| `indices` | number[] | no | Only non-negative integers are used, and only the first 30. |

**Validation order:** content length, then body parse (a failed parse becomes `null`), then `Input too long`, then `Missing inputs`.

**Behaviour**

1. Loads the profile and selects the requested evidence.
2. Asks the `easy` tier for questions with `generateJsonSafe` (one retry).
3. If fewer than two usable questions come back, asks once more with a stricter instruction and no retry.
4. Normalises the result: two to five questions, each with two to five options. Filler options such as "Other", "Not sure" or "None of these" are removed.

**Success: `200`**

```json
{
  "questions": [
    {
      "id": "q1",
      "decision": "Which example to lead with",
      "prompt": "Which project best shows the reporting automation this role asks for?",
      "why": "The job description emphasises automating operations reporting.",
      "type": "single",
      "options": [
        { "id": "a", "label": "Operations reporting tool", "detail": "Weekly data pipeline that generates the report" },
        { "id": "b", "label": "Customer onboarding flow", "detail": "Reduced onboarding from seven steps to four" }
      ]
    }
  ]
}
```

The example is illustrative. `type` is `single` or `multiple`.

**Errors**

- `401` `Unauthorized`
- `413` `Request too large`
- `400` `Input too long`
- `400` `Missing inputs`
- `200` with `{ "questions": [], "unavailable": true }` when the AI call or the database fails. The failure is logged.
- If the client disconnects, the handler rethrows the abort reason and no response is sent.

**Side effects:** one User read. No writes. Up to two `easy` requests in the first step, and one more when fewer than two questions come back. The overall timeout is 50 seconds.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate/clarifications \
  -H 'Content-Type: application/json' \
  -d '{"kind":"cover-letter","company":"Example Pty Ltd","jobDescription":"Senior engineer to automate operations reporting. TypeScript and PostgreSQL.","indices":[0,1]}'
```

#### `POST /api/generate/cover-letter`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `company` | string | yes | Trimmed, 300 characters maximum. |
| `jobDescription` | string | yes | Trimmed, 18,000 characters maximum. |
| `indices` | number[] | no | Evidence to prioritise. See the limits table above. |
| `advancedMode` | boolean | no | Defaults to `false`. Selects the multi-agent advanced path. |
| `clarificationAnswers` | array | no | Up to five entries of `{ "question": string, "answers": string[] }`. Each question is cut to 280 characters, and each answer to 500 characters, with at most five answers per question. |

**Validation order:** content length, then `Missing inputs` (company or job description empty), then `Input too long`, then `Invalid evidence selection` for bad `indices`. After the profile loads, an index beyond the evidence list also returns `Invalid evidence selection`.

**Behaviour**

- Standard path: builds a prompt from the selected evidence, the company, the job description and the clarification answers. `generateWithFallback` tries the `hard` tier, waits 500 ms and tries `hard` again, then falls back to `easy`.
- Advanced path: `generateAdvancedCoverLetter` runs the multi-agent pipeline. If it fails, the route falls back to the standard path and sets `advancedFallback: true`.
- Both paths then run the claim check (`checkDraftClaims`, `easy` tier, no retries, 18-second timeout). The check never throws by itself. When it finds something to review, it returns `reviewWarning`.
- The overall time limit is 240 seconds.

**Success: `200`, standard path**

```json
{
  "coverLetter": "Dear Hiring Manager,\n\nI am applying for the Senior Engineer role at Example Pty Ltd. ...",
  "reviewWarning": "One sentence describes a tool that is not listed in the profile. Check it before sending."
}
```

`reviewWarning` is omitted when the check finds nothing. `fallback` is `"easy"` only when the `easy` tier wrote the letter. `advancedFallback` is `true` only when advanced mode was requested and failed.

**Success: `200`, advanced path**

```json
{
  "reviewWarning": null,
  "coverLetter": "Dear Hiring Manager,\n\n...",
  "advancedTrace": { "mode": "advanced", "roleFocus": "Operations automation", "finalEvidenceCount": 4 },
  "indices": [0, 3, 5, 7],
  "advancedMode": true
}
```

`advancedTrace` records the role focus, requirement coverage, reviewer notes and agent steps. The example shows a few keys only.

**Errors**

- `401` `Unauthorized`
- `413` `Request too large`
- `400` `Missing inputs`
- `400` `Input too long`
- `400` `Invalid evidence selection`
- `503` `Unable to load your profile. Please try again.` (database failure, not a timeout)
- `504` `Generation timed out. Please try again.` (the 240-second limit was reached)
- `502` `Cover letter generation temporarily unavailable. Please try again.` (every model failed or returned empty text)
- If the client disconnects, the handler rethrows and no response is sent.

**Side effects:** one User read. No writes. Standard path: up to three `hard` or `easy` requests. Advanced path: several more requests, then the claim check.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate/cover-letter \
  -H 'Content-Type: application/json' \
  -d '{"company":"Example Pty Ltd","jobDescription":"Senior engineer to automate operations reporting. TypeScript and PostgreSQL.","indices":[0],"advancedMode":false}'
```

#### `POST /api/generate/employer-question`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `question` | string | yes | Trimmed, 4,000 characters maximum. |
| `company` | string | no | Trimmed, 300 characters maximum. |
| `jobDescription` | string | no | Trimmed, 18,000 characters maximum. |
| `idealWordCount` | string | no | Trimmed, 100 characters maximum. Rejected when longer. |
| `answerStyle` | string | no | Trimmed, 300 characters maximum. Rejected when longer. |
| `indices`, `advancedMode`, `clarificationAnswers` | | no | As for `POST /api/generate/cover-letter`. |

For this kind, only `question` is required. Company and job description may be empty.

**Validation order:** content length, `Missing question`, `Input too long`, `Invalid evidence selection`.

**Behaviour:** the same structure as the cover letter route. The advanced path uses `generateAdvancedEmployerAnswer`. The claim check and timeouts are the same.

**Success: `200`**

```json
{
  "reviewWarning": "The answer mentions a team size that the profile does not state.",
  "answer": "In my last role I led the reporting automation work end to end, ...",
  "advancedFallback": true
}
```

The advanced path returns `advancedTrace`, `indices` and `advancedMode: true` in place of `advancedFallback`.

**Errors**

- `401` `Unauthorized`
- `413` `Request too large`
- `400` `Missing question`
- `400` `Input too long`
- `400` `Invalid evidence selection`
- `503` `Unable to load your profile. Please try again.`
- `504` `Generation timed out. Please try again.`
- `502` `Employer question answer generation temporarily unavailable. Please try again.`

**Side effects:** one User read. No writes. AI use is the same as the cover letter route.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate/employer-question \
  -H 'Content-Type: application/json' \
  -d '{"company":"Example Pty Ltd","question":"Describe a time you automated a manual process.","idealWordCount":"150","answerStyle":"direct and specific"}'
```

#### `POST /api/generate/select`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `jobDescription` | string | yes | No maximum length is enforced in this route. |

**Validation:** `Missing jobDescription` when the value is falsy. The body is parsed outside a `try` block, so malformed JSON returns the framework `500`.

**Behaviour**

1. Loads the profile and builds the evidence list.
2. If the list is empty, returns the empty result without an AI call.
3. Otherwise asks the `hard` tier to rank the evidence (one retry). A ranking is kept only when its index is a unique integer inside the list. At most six are kept.
4. If the AI call fails or returns no valid rankings, the first six items are returned with a generic justification.

**Success: `200`**

```json
{
  "indices": [2, 0],
  "items": [
    { "index": 0, "type": "project", "title": "Operations reporting tool", "summary": "Weekly reporting pipeline." },
    { "index": 2, "type": "experience", "title": "Software Engineer", "summary": "Internal tooling for operations." }
  ],
  "rankings": [
    {
      "index": 2,
      "type": "experience",
      "title": "Software Engineer",
      "summary": "Internal tooling for operations.",
      "justification": "Shows the reporting automation the role asks for."
    }
  ]
}
```

`items` contains every evidence item. `rankings` contains up to six entries. When the profile has no evidence, all three keys are empty arrays.

**Errors**

- `401` `Unauthorized`
- `400` `Missing jobDescription`
- A database failure is not caught and returns the framework `500`.

**Side effects:** one User read. No writes. One `hard` request, up to two attempts.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate/select \
  -H 'Content-Type: application/json' \
  -d '{"jobDescription":"Senior engineer to automate operations reporting. TypeScript and PostgreSQL."}'
```

#### `POST /api/generate/cover-letter/pdf`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `coverLetter` | string | yes | Trimmed. Missing or empty returns `400` `Missing coverLetter`. |
| `company` | string | no | Trimmed. Used in the filename and the letter layout. |

**Behaviour**

- Loads the profile for the contact block.
- Renders with three presets in order: `premium`, `compact` and `micro`. The first render at or below 512 KB (524,288 bytes) is returned. If none fits, the smallest render is returned and `X-CV-Assistant-Within-512KB` is `false`.
- Fonts are Noto Sans, embedded from the repository. A preset that prefers standard fonts uses Helvetica when the text is Latin-1 only.
- Dates are formatted in `en-AU` for the `Australia/Melbourne` time zone.

**Success: `200`**

The body is the PDF. Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="<company>-cover-letter.pdf"`, or `cover-letter.pdf` when no company is given |
| `X-CV-Assistant-PDF-Size` | size in bytes |
| `X-CV-Assistant-Compressed` | `true` unless the `premium` preset was used |
| `X-CV-Assistant-PDF-Preset` | `premium`, `compact` or `micro` |
| `X-CV-Assistant-Within-512KB` | `true` or `false` |

**Errors**

- `401` `Unauthorized`
- `400` `Missing coverLetter`
- Malformed JSON and database failures are not caught and return the framework `500`.

**Side effects:** one User read. No writes. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate/cover-letter/pdf \
  -H 'Content-Type: application/json' \
  -d '{"company":"Example Pty Ltd","coverLetter":"Dear Hiring Manager,\n\nI am applying for the Senior Engineer role."}' \
  -D - -o cover-letter.pdf
```

### 3.6 Generate resume

#### `POST /api/generate-resume`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** Next.js default

This route validates the request, optionally runs AI coaching, and then calls the matching `POST /api/resume/styleN` route on the same origin. The caller's cookie is forwarded.

**Request body (JSON)**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `selectedStyle` | `"style1"` to `"style5"` | yes | none | Chooses the template route. |
| `skills` | string | no | `""` | Skills text for the resume. |
| `selectedProjects` | number[] | no | `[]` | Positions in `profile.projects`. |
| `selectedExperiences` | number[] | no | `[]` | Positions in `profile.experiences`. |
| `enhance` | boolean | no | `false` | Rewrites bullets with the `hard` tier. Set to `false` when coaching runs. |
| `qa` | `{ role, content }[]` | no | `[]` | Question and answer context. |
| `stylePreferences` | any | no | none | Passed through to the style route. |
| `contentEnhancementData` | object of string to string | no | `{}` | Pre-written bullets, keyed `experience-<n>` or `project-<n>`. |
| `ai_coaching_enabled` | boolean | no | `false` | Runs the coaching pipeline first. |
| `job_description` | string | no | `""` | Needed for coaching. |

**Limits:** without coaching, the request may select at most 20 items across projects and experiences (`MAX_RESUME_ITEMS`). With coaching, the coaching step chooses the items. The style route still enforces the 20-item limit on the result.

**Behaviour**

1. Validates the body with zod. Any failure returns `400` `Invalid resume generation payload.`
2. Without coaching, applies the 20-item limit.
3. With coaching, loads the profile (a database failure is not caught) and runs `runAICoaching`. The result replaces the selected items and the enhancement data, sets `enhance` to `false`, and is passed on as `coachingTrace`.
4. Calls `POST ${origin}/api/resume/${selectedStyle}` with the selected items, the skills, the Q&A, `autoFit` set to `ai_coaching_enabled`, and the forwarded cookie.
5. If the style route returns a non-OK status, its status, body and content type are returned unchanged.
6. On success, returns the PDF and copies the style route's telemetry headers.

**Success: `200`**

The body is the PDF. `Content-Type` and `Content-Disposition` are copied from the style route (defaults `application/pdf` and `inline; filename="resume.pdf"`). These telemetry headers are copied when present:

- `X-CV-Assistant-Resume-Pages`
- `X-CV-Assistant-Resume-ATS-Score`
- `X-CV-Assistant-Resume-Density`
- `X-CV-Assistant-Resume-Selected-Experiences`
- `X-CV-Assistant-Resume-Selected-Projects`
- `X-CV-Assistant-Resume-Times-Style`
- `X-CV-Assistant-Resume-Truncated`

**Errors**

- `401` `Unauthorized`
- `400` `Invalid resume generation payload.`
- `400` `You can include at most 20 items across projects and experiences.` (coaching off)
- `400` `Add at least one project or experience before using AI Coaching.` (coaching on, no items on the profile)
- `400` `Job description is too short. Please add at least 20 words so AI Coaching has enough context.` (coaching on)
- `400` with the relevance reason from the model, or `The job description does not look specific enough for AI Coaching.` (coaching on)
- `500` `AI Coaching could not analyze this job description right now. Please try again.` (any other coaching failure)
- The style route's own status and body, for example `400` `Please select at least one project or experience` or `400` `Too many items selected`.

**Side effects:** one User read when coaching is on. Coaching makes `hard` tier calls (section 5). The style route makes its own AI calls, depending on its flags. The internal URL has no base path. See Known gaps, item 4.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/generate-resume \
  -H 'Content-Type: application/json' \
  -d '{"selectedStyle":"style1","selectedProjects":[0],"selectedExperiences":[0,1],"skills":"TypeScript, Node.js, PostgreSQL","enhance":false,"ai_coaching_enabled":false}' \
  -D - -o resume.pdf
```

### 3.7 Resume

The five `styleN` routes call the same renderer, `renderResumePdf` in `src/lib/resume/pdf-renderer.ts`, with a different `template` value. The five files differ only in that value, as confirmed with `diff`. The labels come from `src/components/resume/style-options.ts`: Style 1 is Harvard, Style 2 is Chronological, Style 3 is Modernised, Style 4 is Creative and Style 5 is Ledger.

The renderer fits the content to at most two pages. It tries three density presets (`professional`, `compact`, `micro`). It reports whether content had to be cut.

#### `POST /api/resume/style1`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `selectedProjects` | number[] | at least one item across both lists | Non-integer values are dropped. Positions in `profile.projects`. Positions that do not exist select nothing. |
| `selectedExperiences` | number[] | as above | Non-integer values are dropped. Positions in `profile.experiences`. |
| `skills` | string | no | A non-string value becomes `""`. |
| `contentEnhancementData` | object | no | Pre-written bullets keyed `experience-<n>` or `project-<n>`. Defaults to `{}`. |
| `enhance` | boolean | no | Rewrites skills, experience and project text with the `hard` tier. |
| `autoFit` | boolean | no | Backfills items when the last page is under-filled and enables the narrative step. |
| `jobDescription` | string | no | Used by the narrative and enhancement prompts. |
| `qa`, `stylePreferences`, `coachingTrace` | any | no | Passed to the renderer. |

No negative-value check is applied. The combined count is limited to 20.

**Success: `200`**

The body is the PDF. Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `inline; filename="resume.pdf"` |
| `X-CV-Assistant-Resume-Pages` | page count |
| `X-CV-Assistant-Resume-ATS-Score` | ATS score from the renderer |
| `X-CV-Assistant-Resume-Density` | density preset used |
| `X-CV-Assistant-Resume-Selected-Experiences` | count of experiences rendered |
| `X-CV-Assistant-Resume-Selected-Projects` | count of projects rendered |
| `X-CV-Assistant-Resume-Times-Style` | `true` when the Times standard font was used, otherwise `fallback` |
| `X-CV-Assistant-Resume-Truncated` | `true` when content was cut to two pages, otherwise `false` |

**Errors**

- `401` `Unauthorized`
- `400` `Please select at least one project or experience` (also returned for malformed JSON, because the body then parses to `null`)
- `400` `Too many items selected` (more than 20 items)
- A renderer exception is not caught and returns the framework `500`.

**Side effects:** one User read. No writes. AI use depends on the flags. `enhance` makes `hard` tier calls. A job description with `autoFit` or `enhance` makes one `easy` tier call for the narrative. Otherwise there are no AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style1 \
  -H 'Content-Type: application/json' \
  -d '{"selectedProjects":[0],"selectedExperiences":[0,1],"skills":"TypeScript, Node.js, PostgreSQL"}' \
  -D - -o resume.pdf
```

#### `POST /api/resume/style2`

- **Exports:** `POST`
- **Auth:** yes
- **Template:** `style2` (Chronological)

Identical to `style1` in request fields, validation, headers, errors and side effects. See 3.7, `POST /api/resume/style1`.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style2 \
  -H 'Content-Type: application/json' \
  -d '{"selectedExperiences":[0,1],"skills":"TypeScript, Node.js, PostgreSQL"}' \
  -D - -o resume.pdf
```

#### `POST /api/resume/style3`

- **Exports:** `POST`
- **Auth:** yes
- **Template:** `style3` (Modernised)

Identical to `style1` in request fields, validation, headers, errors and side effects. See 3.7, `POST /api/resume/style1`.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style3 \
  -H 'Content-Type: application/json' \
  -d '{"selectedProjects":[0],"selectedExperiences":[0],"skills":"TypeScript, Node.js, PostgreSQL"}' \
  -D - -o resume.pdf
```

#### `POST /api/resume/style4`

- **Exports:** `POST`
- **Auth:** yes
- **Template:** `style4` (Creative)

Identical to `style1` in request fields, validation, headers, errors and side effects. See 3.7, `POST /api/resume/style1`.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style4 \
  -H 'Content-Type: application/json' \
  -d '{"selectedProjects":[0],"selectedExperiences":[0],"skills":"TypeScript, Node.js, PostgreSQL"}' \
  -D - -o resume.pdf
```

#### `POST /api/resume/style5`

- **Exports:** `POST`
- **Auth:** yes
- **Template:** `style5` (Ledger)

Identical to `style1` in request fields, validation, headers, errors and side effects. See 3.7, `POST /api/resume/style1`.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style5 \
  -H 'Content-Type: application/json' \
  -d '{"selectedExperiences":[0,1],"skills":"TypeScript, Node.js, PostgreSQL"}' \
  -D - -o resume.pdf
```

#### `POST /api/resume/beautify`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Must be a non-empty string. |
| `contentType` | string | no | Inserted into the prompt. Not validated. |
| `stylePreferences` | any | no | Serialised into the prompt. |

The prompt asks for Markdown emphasis only: bold for achievements and metrics, italics for tools. It forbids new facts and removed facts.

**Success: `200`**

```json
{
  "formattedContent": "Led **reporting automation** for the operations team using *TypeScript* and *PostgreSQL*.",
  "hasMarkdown": true
}
```

`hasMarkdown` is `true` when the output contains `*`.

**Errors**

- `401` `Unauthorized`
- `400` `Invalid content`
- `500` `Failed to beautify content`
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `hard` tier call.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/beautify \
  -H 'Content-Type: application/json' \
  -d '{"content":"Led reporting automation for the operations team using TypeScript and PostgreSQL.","contentType":"experience"}'
```

#### `POST /api/resume/coach`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `agentType` | string | no | Defaults to `styling`. The value `styling` returns the UI marker with no AI call. Any other value runs the content agent. The value is echoed back. |
| `messages` | `{ role, content }[]` | no | Defaults to `[]`. Not validated per item. |
| `hint` | string | no | Added to the content agent prompt when present. |

**Behaviour**

- `styling`: returns `<STYLING_UI>` at once. The client then shows its own styling controls.
- Content agent: asks the `hard` tier for the next coaching turn. The agent asks two questions, one at a time, and then replies `<CONTENT_READY>`.

**Success: `200`**

```json
{ "message": "How would you like your resume content formatted?", "agentType": "content" }
```

For `styling`, the body is `{ "message": "<STYLING_UI>", "agentType": "styling" }`.

When the AI call fails, the route still returns `200`. The canned message is the first question when there are no user messages, the second question after one user message, and `<CONTENT_READY>` after that.

**Errors**

- `401` `Unauthorized`
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `hard` tier call for the content agent only.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/coach \
  -H 'Content-Type: application/json' \
  -d '{"agentType":"content","hint":"Senior backend role","messages":[{"role":"user","content":"Focus on impact."}]}'
```

#### `POST /api/resume/enhance`

- **Exports:** `POST`
- **Auth:** yes

This route is separate from `POST /api/enhance` (section 3.4).

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Must be a non-empty string. |
| `contentType` | string | no | Inserted into the prompt. |
| `qaContext` | string | no | Context from the Q&A step. Defaults to "No additional context provided". |

**Success: `200`**

```json
{
  "enhancedContent": "Led end-to-end reporting automation for the operations team ...",
  "originalLength": 92,
  "enhancedLength": 214,
  "expansionPercentage": 133
}
```

`expansionPercentage` is rounded to a whole number and can be negative.

**Errors**

- `401` `Unauthorized`
- `400` `Invalid content`
- `500` `Failed to enhance content`
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `easy` tier call.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/enhance \
  -H 'Content-Type: application/json' \
  -d '{"content":"Built internal tooling for the operations team.","contentType":"experience","qaContext":"Saved about 6 hours a week."}'
```

#### `POST /api/resume/enhance-targeted`

- **Exports:** `POST`
- **Auth:** yes

Used by Resume Studio in the bundled UI.

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemType` | string | yes | For example `experience` or `project`. |
| `itemName` | string | yes | Role or project name. |
| `originalContent` | string | yes | The text to rewrite. |
| `userPreferences` | object | yes | Holds `format` and `modifications`. Recognised `format` values are `concise`, `enhance` and `preserve`. |

**Validation:** all four fields must be truthy. Otherwise `400` `Missing required fields`.

**Success: `200`**

```json
{
  "enhancedContent": "- Automated weekly operations reporting, cutting manual effort.",
  "itemType": "experience",
  "itemName": "Software Engineer",
  "originalLength": 92,
  "enhancedLength": 71
}
```

**Errors**

- `401` `Unauthorized`
- `400` `Missing required fields`
- `500` with `{ "error": "Failed to enhance content", "fallback": "<originalContent>" }`. The original text is returned so the client can keep it.
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `hard` tier call.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/enhance-targeted \
  -H 'Content-Type: application/json' \
  -d '{"itemType":"experience","itemName":"Software Engineer","originalContent":"Built internal tooling for the operations team.","userPreferences":{"format":"concise","modifications":"Lead with the outcome."}}'
```

#### `POST /api/resume/style-parser`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userResponse` | string | yes | Free-text styling answer. Must be a non-empty string. |

**Behaviour:** asks the `easy` tier for a JSON object with fixed keys. The route extracts the first `{ ... }` block from the reply and parses it. Missing keys get defaults. Values are not checked against the allowed set, so an unexpected `fontSize` is passed through.

**Success: `200`**

```json
{
  "fontSize": "11pt",
  "useBold": false,
  "useItalic": false,
  "boldSections": [],
  "italicSections": [],
  "contentDensity": "balanced",
  "additionalNotes": "Using default preferences"
}
```

Defaults: `fontSize` `11pt`, `useBold` `false`, `useItalic` `false`, `boldSections` `[]`, `italicSections` `[]`, `contentDensity` `balanced`, `additionalNotes` `""`.

**Errors**

- `401` `Unauthorized`
- `400` `Invalid user response`
- `500` `Failed to parse style preferences` when the model reply contains no JSON object
- `200` with the defaults and `additionalNotes` set to `Using default preferences due to API error` when the model call or the JSON parse throws
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `easy` tier call.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/style-parser \
  -H 'Content-Type: application/json' \
  -d '{"userResponse":"Use 12pt, bold the section headings and keep it balanced."}'
```

#### `POST /api/resume/summarize`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Must be a non-empty string. |
| `contentType` | string | no | Inserted into the prompt. |

**Success: `200`**

```json
{
  "summarizedContent": "Automated operations reporting in TypeScript.",
  "originalLength": 92,
  "summarizedLength": 46,
  "reductionPercentage": 50
}
```

**Errors**

- `401` `Unauthorized`
- `400` `Invalid content`
- `500` `Failed to summarize content`
- Malformed JSON is read outside a `try` block and returns the framework `500`.

**Side effects:** no writes. One `easy` tier call.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/resume/summarize \
  -H 'Content-Type: application/json' \
  -d '{"content":"Built internal tooling for the operations team, automating weekly reports in TypeScript.","contentType":"experience"}'
```

### 3.8 Search

The search routes use these values:

- Sources: `linkedin`, `seek`, `indeed`, `careerone`, `adzuna`, `talent`.
- `postedWithin`: `any`, `24h`, `3d`, `7d`, `14d`, `30d`.
- `workplaceMode`: `any`, `remote`, `hybrid`, `onsite`.
- `employmentType`: `any`, `full-time`, `part-time`, `contract`, `internship`.
- `maxResultsPerSource`: `25`, `50` or `100`.

Each search route loads the user's context snapshot with `loadUserContextSnapshot`. The first call creates a default UserContext document.

#### `POST /api/search/advanced`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`

**Request body (JSON)**

Validated with a partial of `searchRequestSchema`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `jobTitle` | string | yes | Trimmed. |
| `location` | string | yes | Trimmed. |
| `filters` | object | no | Same keys as above. Defaults apply. |
| `selectedSources` | array | no | Subset of the sources. If sent, it must have at least one entry. |
| `searchInstruction` | string | no | Up to 1,200 characters. |
| `maxResultsPerSource` | 25, 50 or 100 | no | Used for context only. |
| `instructionExpansion`, `advancedSearchSession` | object or null | no | Accepted but not used. |

**Validation:** any schema failure, or a missing `jobTitle` or `location`, returns `400` `Job title and location are required.` The Zod messages are not returned. For example, an empty `selectedSources` array gives this same message.

**Success: `200`**

```json
{
  "summary": "Clarify the seniority and work mode before searching.",
  "questions": [
    { "id": "seniority", "prompt": "What seniority level are you targeting?", "helperText": "Choose the closest match." },
    { "id": "stack", "prompt": "Which stack matters most?" }
  ]
}
```

The plan has two to five questions. A fallback plan is returned when the model fails.

**Errors**

- `401` `Unauthorized`
- `400` `Job title and location are required.`
- A failure while loading the context snapshot is not caught and returns the framework `500`.

**Side effects:** may create the default UserContext document. One `easy` tier request, up to two attempts.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/search/advanced \
  -H 'Content-Type: application/json' \
  -d '{"jobTitle":"Software Engineer","location":"Melbourne, VIC","selectedSources":["seek","indeed"],"searchInstruction":"Hybrid roles that use TypeScript"}'
```

#### `POST /api/search/advanced-sequential`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`

**Request body (JSON)**

This route does not use zod, so nothing is type-checked or length-limited.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `jobTitle` | string | yes | none | |
| `location` | string | yes | none | |
| `filters` | object | no | `any` for each key | |
| `selectedSources` | array | no | `[]` | |
| `searchInstruction` | string | no | `""` | No length limit in this route. |
| `previousQuestions` | `{ id, prompt, helperText? }[]` | no | `[]` | |
| `previousAnswers` | `{ questionId, answer }[]` | no | `[]` | |

**Validation:** `Job title and location are required.` when `jobTitle` or `location` is falsy.

**Behaviour:** asks the `easy` tier for the next question. The prompt uses the previous answers and up to three of the candidate's experiences. The route reports completion after five questions. If the model fails, the fallback question IDs have the form `question-N`.

**Success: `200`**

```json
{
  "question": { "id": "remote", "prompt": "Do you want remote roles only, or are hybrid roles fine?" },
  "isComplete": false,
  "summary": "Software engineer roles in Melbourne."
}
```

When the sequence is complete, `question` is `null` and `isComplete` is `true`.

**Errors**

- `401` `Unauthorized`
- `400` `Job title and location are required.`
- A failure while loading the snapshot or building the question is not caught and returns the framework `500`.

**Side effects:** may create the default UserContext document. One `easy` tier request.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/search/advanced-sequential \
  -H 'Content-Type: application/json' \
  -d '{"jobTitle":"Software Engineer","location":"Melbourne, VIC","selectedSources":["seek"],"searchInstruction":"Hybrid roles that use TypeScript","previousQuestions":[],"previousAnswers":[]}'
```

#### `POST /api/search/jobs/stream`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`
- **Response:** NDJSON stream

**Request body (JSON)**

Validated with `searchRequestSchema`.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `jobTitle` | string | yes | none | Trimmed. |
| `location` | string | yes | none | Trimmed. |
| `filters` | object | no | `any` for each key | See the value lists above. |
| `maxResultsPerSource` | 25, 50 or 100 | no | `50` | |
| `selectedSources` | array | no | all six sources | Must contain at least one source. |
| `searchInstruction` | string | no | `""` | Up to 1,200 characters. |
| `instructionExpansion`, `advancedSearchSession` | object or null | no | `null` | Accepted. |

**Validation:** the first Zod issue message is returned, for example `Job title is required.`, `Location is required.` or `Select at least one hiring platform.`

**Flow before the stream starts**

1. Connects to the database and loads the context snapshot.
2. Expands the search instruction with the `easy` tier (one retry). If that fails, a deterministic expansion is used.
3. Creates a SearchCampaign record.
4. Returns `200` and starts the stream.

**Event stream**

Each line is one JSON object terminated by a newline.

| Type | Shape |
|---|---|
| `status` | `{"type":"status","phase":"starting","message":"..."}`. Phases are `starting`, `running` and `finished`. |
| `source-progress` | `{"type":"source-progress","source":"seek","status":"running","pagesScanned":1,"resultsFound":3}`. Statuses are `pending`, `running`, `complete`, `blocked` and `error`. `message` and `blockedReason` may be present. |
| `result` | `{"type":"result","result":{...}}`. The result holds `id`, `source`, `title`, `company`, `location`, `postedText`, `snippet`, `listingUrl`, `applicationUrl`, `applicationUrlType` (`external`, `board-detail` or `listing`), `searchQueryMatch` (`strong` or `partial`), `dedupeKey` and `duplicateGroupKey`. |
| `complete` | `{"type":"complete","totalResults":12,"blockedSources":["indeed"],"elapsedMs":48210}` |
| `error` | `{"type":"error","message":"...","source":"seek","fatal":true}`. `source` is optional. `fatal` is set for errors that end the stream. |

**Persistence per event**

- Each `result` upserts a JobLead for the user, keyed by dedupe key. A new lead also creates an ApplicationEvent of type `lead_found`.
- `complete` marks the campaign `completed` and records the blocked sources.
- A worker exception marks the campaign `failed`, stores the message, and sends a fatal `error` line.
- A client disconnect marks the campaign `canceled`.

**Success: `200`**

The body is NDJSON. Headers are `Content-Type: application/x-ndjson; charset=utf-8` and `Cache-Control: no-cache, no-transform`.

Example stream (values are placeholders):

```text
{"type":"status","phase":"starting","message":"Starting search"}
{"type":"source-progress","source":"seek","status":"running","pagesScanned":1,"resultsFound":1}
{"type":"result","result":{"id":"seek-88123","source":"seek","title":"Backend Engineer","company":"Example Pty Ltd","location":"Melbourne VIC","postedText":"2 days ago","snippet":"Build reporting services in TypeScript.","listingUrl":"https://www.seek.com.au/job/88123","applicationUrl":"https://www.seek.com.au/job/88123","applicationUrlType":"board-detail","searchQueryMatch":"strong","dedupeKey":"backend engineer::example::melbourne","duplicateGroupKey":"backend engineer::example"}}
{"type":"complete","totalResults":1,"blockedSources":[],"elapsedMs":18342}
```

**Errors**

- Before the stream starts: `401` with `{"error":"Unauthorized"}`, or `400` with `{"error":"<first Zod message>"}`.
- A database failure before the stream starts returns the framework `500`.
- After the stream starts, errors are sent as `error` lines with HTTP `200`.

**Side effects:** writes SearchCampaign, JobLead and ApplicationEvent documents. Sends outbound requests to the job boards. One `easy` tier call before the stream starts.

**Example**

```bash
curl -N -s -b cookies.txt -X POST http://localhost:3000/api/search/jobs/stream \
  -H 'Content-Type: application/json' \
  -d '{"jobTitle":"Software Engineer","location":"Melbourne, VIC","selectedSources":["seek","indeed"],"maxResultsPerSource":25,"searchInstruction":"Prefer hybrid roles that use TypeScript"}'
```

### 3.9 Auto Apply

Auto Apply has its own data model, with sessions that hold job candidates, drafts (one per application), events and memories. These conventions apply to every route in this group:

- Every route requires auth and returns `401` `Unauthorized` without a valid token.
- `[id]` (session) and `[jobId]` (application) must be MongoDB ObjectIds. An invalid ID returns `404`, with `Session not found.` or `Application not found.`.
- Every query filters on the caller's `userId`. Another user's IDs return `404`.
- A pipeline run takes a lock on the session. A new run is refused while the run phase is `searching`, `scoring` or `preparing`, unless the last update is more than 150 seconds old (`RUN_STALL_MS`).
- A single application takes a `preparing` lock. A lock older than four minutes (`PREPARE_LOCK_MS`) can be taken again. Each preparation attempt increments `attempts`.
- Stages are `discovered`, `shortlisted`, `selected`, `preparing`, `prepared`, `needs_input`, `approved`, `applied`, `skipped` and `failed`. Legacy stage names are mapped to these on read.

Allowed stage transitions (from `TRANSITIONS` in `src/lib/auto-apply/state.ts`). Moving to the same stage is always allowed.

| From | To |
|---|---|
| `discovered` | `shortlisted`, `selected`, `skipped`, `preparing` |
| `shortlisted` | `selected`, `skipped`, `discovered`, `preparing` |
| `selected` | `preparing`, `skipped`, `shortlisted`, `discovered` |
| `preparing` | `prepared`, `needs_input`, `failed`, `selected` |
| `needs_input` | `prepared`, `preparing`, `skipped` |
| `prepared` | `approved`, `needs_input`, `preparing`, `skipped` |
| `approved` | `applied`, `prepared`, `preparing` |
| `applied` | `approved` |
| `skipped` | `selected`, `shortlisted`, `discovered` |
| `failed` | `preparing`, `selected`, `skipped` |

The `ground-truth` items used in session settings have IDs of the form `project:<id>`, `experience:<id>` or `profile:<field>`. The ID is the subdocument ID, or the array index when the item has no ID.

#### 3.9.1 Sessions

##### `GET /api/auto-apply/session`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "sessions": [
    {
      "_id": "66a1f0c2e4b0a1b2c3d4e5f7",
      "mode": "ai_coaching",
      "prompt": "Senior backend engineer roles in Melbourne",
      "status": "review",
      "run": { "phase": "idle", "message": "" },
      "updatedAt": "2026-11-06T09:14:00.000Z"
    }
  ]
}
```

Returns up to 20 sessions, most recently updated first. The documents are returned as stored.

**Errors:** `401` `Unauthorized`.

**Side effects:** none.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/session
```

##### `POST /api/auto-apply/session`

- **Exports:** `POST`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `mode` | `"ai_coaching"` or `"manual_curate"` | no | `ai_coaching` | |
| `prompt` | string | yes | none | Trimmed. 1 to 4,000 characters. |
| `filters` | object | no | defaults below | |
| `selectedGroundTruthIds` | string[] | no | `[]` | |
| `allowFullResumeContext` | boolean | no | `false` | |

Filter keys, all optional:

| Key | Type and values | Default |
|---|---|---|
| `location` | string | `""` |
| `workplaceMode` | `any`, `remote`, `hybrid`, `onsite` | `any` |
| `employmentType` | `any`, `full-time`, `part-time`, `contract`, `internship` | `any` |
| `seniority`, `salaryMin`, `salaryMax`, `workRights` | string | `""` |
| `mustHaveKeywords`, `excludeKeywords`, `companyBlacklist` | string[] | `[]` |
| `applicationLimit` | integer, 1 to 100 | `10` |
| `selectedSources` | non-empty subset of the six sources | all six |
| `maxResultsPerSource` | `25`, `50` or `100` | `25` |

**Validation:** the first Zod issue message is returned. Examples are `Prompt is required.` and `Prompt is too long.`. If there is no issue message, the response is `Invalid Auto Apply session payload.`

**Success: `200`**

```json
{
  "session": {
    "_id": "66a1f0c2e4b0a1b2c3d4e5f7",
    "mode": "ai_coaching",
    "prompt": "Senior backend engineer roles in Melbourne",
    "filters": { "location": "Melbourne, VIC", "workplaceMode": "hybrid", "applicationLimit": 10, "selectedSources": ["seek", "indeed"] },
    "selectedGroundTruthIds": ["experience:66a1f0c2e4b0a1b2c3d4e5f6"],
    "allowFullResumeContext": false
  }
}
```

The status is `200`, not `201`. When no ground-truth IDs are sent and full resume context is off, up to eight suggested items are selected from the profile.

**Errors:** `401` `Unauthorized`; `400` with the message above.

**Side effects:** reads the user's profile. Creates an AutoApplySession with a ground-truth snapshot. Logs a `session_created` event. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/session \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Senior backend engineer roles in Melbourne","filters":{"location":"Melbourne, VIC","workplaceMode":"hybrid","applicationLimit":5,"selectedSources":["seek","indeed"]}}'
```

##### `GET /api/auto-apply/session/[id]`

- **Exports:** `GET`
- **Auth:** yes

This is the workspace read used by the UI, and it polls during a run.

**Behaviour:** if the run has stalled, meaning the last update is more than 150 seconds old during an active phase, the route first repairs it. It sets the run phase to `idle`, sets the session status to `review`, sets a message asking the user to press Prepare, and resets any `preparing` jobs to `selected`. This makes a GET write to the database.

**Success: `200`**

```json
{
  "session": { "_id": "66a1f0c2e4b0a1b2c3d4e5f7", "prompt": "Senior backend engineer roles in Melbourne", "status": "review", "run": { "phase": "idle" } },
  "jobs": [
    {
      "_id": "66a1f0c2e4b0a1b2c3d4e5f8",
      "title": "Backend Engineer",
      "company": "Example Pty Ltd",
      "status": "prepared",
      "fitScore": 82,
      "missingAnswers": 0,
      "answerCount": 6,
      "hasCoverLetter": true
    }
  ],
  "counts": { "discovered": 0, "shortlisted": 0, "selected": 0, "preparing": 0, "prepared": 1, "needs_input": 0, "approved": 0, "applied": 0, "skipped": 0, "failed": 0, "total": 1 },
  "phase": "review",
  "events": [
    { "type": "session_created", "message": "Auto Apply session created.", "createdAt": "2026-11-06T09:10:00.000Z" }
  ]
}
```

- `session` omits `sessionGroundTruthSnapshot`.
- `jobs` is sorted by `fitScore`, highest first. It omits `descriptionText`, `questions`, `stageHistory` and `resolutionNotes`. Each job adds `missingAnswers` (answers flagged `needsInput`), `answerCount` and `hasCoverLetter`. Its `status` is normalised.
- `counts` holds the number of jobs in each stage, plus `total`.
- `phase` is the run phase when it is `searching`, `scoring`, `preparing` or `failed`. Otherwise it is derived from the stage counts.
- `events` holds the 40 most recent events, oldest first.

**Errors:** `401` `Unauthorized`; `404` `Session not found.`

**Side effects:** the stall repair described above. No AI calls.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/session/<session-id>
```

##### `PATCH /api/auto-apply/session/[id]`

- **Exports:** `PATCH`
- **Auth:** yes

**Request body (JSON)**

All fields are optional.

| Field | Type | Notes |
|---|---|---|
| `mode` | `"ai_coaching"` or `"manual_curate"` | |
| `prompt` | string | Trimmed. An empty value is ignored. This route sets no length limit. |
| `filters` | partial filters object | Merged into the stored filters, then validated. Same keys as the create route. |
| `selectedGroundTruthIds` | string[] | An empty array triggers the eight-item suggestion. |
| `allowFullResumeContext` | boolean | |

The `status` field is system-owned and is never accepted from the client. Unknown keys are dropped by zod.

**Validation:** the first Zod issue message is returned, or `Invalid session update.` if there is none.

**Success: `200`**

```json
{ "session": { "_id": "66a1f0c2e4b0a1b2c3d4e5f7", "prompt": "Backend roles in Melbourne", "filters": { "location": "Melbourne, VIC", "workplaceMode": "hybrid" } } }
```

The response is the fresh session document, including `sessionGroundTruthSnapshot`.

**Errors**

- `401` `Unauthorized`
- `404` `Session not found.`
- `409` `Wait for the current run to finish before changing settings.` (run phase is `searching`, `scoring` or `preparing`)
- `400` with the message above

**Side effects:** updates the session. If `selectedGroundTruthIds` or `allowFullResumeContext` is sent, the ground-truth snapshot is rebuilt. Logs a `session_updated` event (`Search settings updated.`). No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/auto-apply/session/<session-id> \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Backend roles in Melbourne","filters":{"location":"Melbourne, VIC","workplaceMode":"hybrid"}}'
```

##### `POST /api/auto-apply/session/[id]/run`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`, `maxDuration = 300`

**Request body (JSON, optional)**

| Field | Type | Notes |
|---|---|---|
| `mode` | string | `"prepare"` prepares the jobs already marked `selected`. Any other value, or no body, runs the full pipeline. |

**Behaviour:** the route claims the run lock, then returns at once. The work continues after the response through `after()`.

- Full pipeline: discovery, fit scoring, selection and preparation. The run budget is 270 seconds (`RUN_BUDGET_MS`).
- Prepare-only: prepares the jobs in `selected` status. It does not run discovery.

**Success: `202`**

```json
{ "started": true }
```

Poll `GET /api/auto-apply/session/[id]` for progress.

**Errors**

- `401` `Unauthorized`
- `404` `Session not found.`
- `409` `A run is already in progress for this session.`
- `400` `Select at least one role first.` (prepare mode with no selected jobs. The run state is reset to `idle`.)

**Side effects:** writes the run state (phase `searching`, stats cleared, status `searching`, last error cleared). Writes job candidates, drafts and events. Sends outbound requests to job boards and application endpoints. AI calls: `easy` tier for fit scoring in batches of six, and for answers and narrative during preparation. The cover letter agent also runs during preparation (section 5).

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/session/<session-id>/run \
  -H 'Content-Type: application/json' \
  -d '{"mode":"prepare"}'
```

##### `POST /api/auto-apply/session/[id]/cancel`

- **Exports:** `POST`
- **Auth:** yes
- **Request body:** none

Sets the run phase to `cancelled` with the message `Stopping`. The running pipeline checks for cancellation between steps, so the stop is cooperative. The route does not check whether a run is active, so it also succeeds for an idle session.

**Success: `200`**

```json
{ "cancelled": true }
```

**Errors:** `401` `Unauthorized`; `404` `Session not found.`

**Side effects:** updates the session. Logs a `run_cancel_requested` event (`Stop requested.`). No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/session/<session-id>/cancel
```

##### `GET /api/auto-apply/session/[id]/events`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "events": [
    { "type": "session_created", "message": "Auto Apply session created.", "createdAt": "2026-11-06T09:10:00.000Z" },
    { "type": "approved", "message": "Approved 1 application.", "jobCandidateId": "66a1f0c2e4b0a1b2c3d4e5f8", "createdAt": "2026-11-06T09:31:00.000Z" }
  ]
}
```

Returns the 100 most recent events, oldest first. Each event has `type`, `message` and `createdAt`, and may have `jobCandidateId` and `payload`. The bundled UI reads events through `GET /api/auto-apply/session/[id]` instead.

**Errors:** `401` `Unauthorized`; `404` `Session not found.`

**Side effects:** none.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/session/<session-id>/events
```

##### `POST /api/auto-apply/session/[id]/refresh-answers`

- **Exports:** `POST`
- **Auth:** yes
- **Request body:** none

Applies standing answers to open applications. It considers only applications in `needs_input` or `prepared` status. It fills missing or flagged answers when the saved reusable answers, the profile or the preferences give a definite value. Approved and applied applications are not changed. Each changed application gets a recalculated ready state and payload hash.

**Success: `200`**

```json
{ "updated": 3 }
```

`updated` is the number of applications that changed.

**Errors:** `401` `Unauthorized`; `404` `Session not found.`

**Side effects:** writes drafts and job candidates. Logs an `answers_refreshed` event when anything changed. The fill is deterministic. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/session/<session-id>/refresh-answers
```

##### `POST /api/auto-apply/session/[id]/approve`

- **Exports:** `POST`
- **Auth:** yes

This batch route approves every listed prepared application whose answers are complete, or withdraws approval when `undo` is set. The payload hash is recorded at approval, so the approved content is the content in the autofill pack.

**Request body (JSON)**

| Field | Type | Notes |
|---|---|---|
| `jobIds` | string[] | Application IDs. Every entry must be a valid ObjectId string. |
| `all` | boolean | Set to `true` to act on every eligible application in the session. Required when `jobIds` is absent. |
| `undo` | boolean | Withdraws approval for applications in `approved` status. Undo sets them back to `prepared`. |
| `reviewedHashes` | object | Optional map of application ID to payload hash. A mismatch skips that application. No endpoint returns hashes, so see Known gaps, item 9. |

**Validation**

- A body that is not JSON, or not an object, returns `400` `Send a JSON body.`
- `jobIds` that is not an array, or that contains a non-ObjectId value, returns `400` `jobIds must be an array of job ids.`
- With neither `jobIds` nor `all: true`, the response is `400` `List jobIds or pass all: true.`

**Per-application rules**

- No draft: skipped with `No prepared application`.
- Answers still missing: skipped with `Some answers are still missing`.
- `reviewedHashes` given and different from the current hash: skipped with `Changed since you reviewed it`.
- The approval is claimed atomically. A job that another request approves first is skipped without a reason. It does not appear in `skipped`.

**Success: `200`**

```json
{
  "approved": ["66a1f0c2e4b0a1b2c3d4e5f8"],
  "skipped": [{ "id": "66a1f0c2e4b0a1b2c3d4e5f9", "reason": "Some answers are still missing" }]
}
```

With `undo`, `approved` lists the applications whose approval was withdrawn.

**Errors:** `401` `Unauthorized`; `404` `Session not found.`; `400` with one of the validation messages above.

**Side effects:** on approval, sets the job status to `approved`, the draft to `approved` with `approvedAt` and `payloadHash`, and appends a stage history entry. On undo, the reverse. Logs an `approved` or `approval_withdrawn` event. Sets the session status to `review` when anything changed. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/session/<session-id>/approve \
  -H 'Content-Type: application/json' \
  -d '{"all":true}'
```

#### 3.9.2 Applications (jobs)

##### `GET /api/auto-apply/job/[jobId]`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "job": {
    "_id": "66a1f0c2e4b0a1b2c3d4e5f8",
    "title": "Backend Engineer",
    "company": "Example Pty Ltd",
    "status": "prepared",
    "fitScore": 82
  },
  "draft": {
    "_id": "66a1f0c2e4b0a1b2c3d4e5fa",
    "coverLetterText": "Dear Hiring Manager, ...",
    "answers": [
      {
        "questionId": "q-first-name",
        "fieldName": "first_name",
        "label": "First name",
        "type": "text",
        "category": "first_name",
        "required": true,
        "options": [],
        "value": "Jordan",
        "source": "profile",
        "confidence": 0.95,
        "needsInput": false,
        "sensitive": false
      }
    ],
    "applyUrl": "https://boards.greenhouse.io/example/jobs/12345",
    "formSource": "greenhouse",
    "finalReviewStatus": "ready",
    "riskNotes": [],
    "letterClaims": [],
    "generatedBy": "nvidia/nemotron-3-ultra-550b-a55b",
    "preparedAt": "2026-11-06T09:20:00.000Z",
    "approvedAt": null
  }
}
```

- `job` omits `questions` and has a normalised `status`.
- `draft` is `null` when the application has not been prepared. The fields are the ones shown. The payload hash is not returned.
- Each answer gets default values for `value`, `needsInput`, `required`, `type` and `category`, and `options` is always an array. This keeps older drafts usable.

**Errors:** `401` `Unauthorized`; `404` `Application not found.`

**Side effects:** none.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/job/<job-id>
```

##### `PATCH /api/auto-apply/job/[jobId]`

- **Exports:** `PATCH`
- **Auth:** yes

**Request body (JSON)**

| Field | Type | Notes |
|---|---|---|
| `stage` | `selected`, `skipped`, `shortlisted` or `discovered` | Checked against the transition table. |
| `coverLetterText` | string, 8,000 characters maximum | Replaces the cover letter. |
| `confirmCoverLetter` | boolean | Marks the cover letter as reviewed. Clears the letter's unsupported-claim list. |
| `answers` | array, 80 items maximum | Each item: `questionId` (at least one character), `value` (4,000 characters maximum), `remember` (boolean, optional). |

**Validation:** the first Zod issue message is returned, or `Invalid update.` if there is none.

**Behaviour**

1. A `stage` change is checked against the transition table and written first.
2. Answer and cover letter edits are applied next. Editing the cover letter or confirming it counts as the candidate's review of the flagged items in that letter.
3. Readiness is recalculated. The draft becomes `needs_input` while any required answer is missing, and `ready` otherwise. The job stage becomes `needs_input` or `prepared`. The payload hash is refreshed, and `approvedAt` is cleared.
4. Each answer with `remember: true` and a non-empty value creates or updates a reusable memory keyed by the question label. Later sessions reuse it.

**Success: `200`**

```json
{ "ok": true }
```

**Errors**

- `401` `Unauthorized`
- `404` `Application not found.`
- `400` with the Zod message above, or `Invalid update.`
- `409` `Cannot move an application from <from> to <to>.` (an illegal stage change, with underscores shown as spaces)
- `409` `This application can no longer be edited.` (stage is `applied` or `preparing`)
- `409` `Prepare this application before editing it.` (no draft yet)

If a stage change and an answer edit arrive together, the stage change is already written when the `409` for the answer edit is returned. See Known gaps, item 11.

**Side effects:** job and draft writes. Memory upserts for `remember`. Logs an `answers_edited` event. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/auto-apply/job/<job-id> \
  -H 'Content-Type: application/json' \
  -d '{"stage":"skipped"}'
```

##### `POST /api/auto-apply/job/[jobId]/prepare`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`, `maxDuration = 300`
- **Request body:** none

**Behaviour:** takes the application's `preparing` lock. It reads the application's questions and fills what it can from the standing answers and the profile. The model handles the rest. The cover letter agent drafts the letter in parallel. The draft is saved, and the stage becomes `prepared` or `needs_input`.

**Success: `200`**

```json
{ "outcome": "prepared" }
```

`outcome` is `prepared` or `needs_input`. It is `missing` only when the application disappears between the ownership check and the lock.

**Errors**

- `401` `Unauthorized`
- `404` `Application not found.`
- `409` `This application is already approved. Unapprove it before re-preparing.` (stage is `applied` or `approved`)
- `409` `This application is already being prepared.` (lock is held)
- `502` `{ "error": "Preparation failed. Try again in a moment.", "outcome": "failed" }`

**Side effects:** writes the job candidate and draft, and logs events. Sends outbound requests to the application endpoints and ATS APIs. AI calls: `easy` tier for the remaining answers, with one retry, and the cover letter agent (section 5).

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/job/<job-id>/prepare
```

##### `POST /api/auto-apply/job/[jobId]/cover-letter`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`, `maxDuration = 300`

**Request body (JSON, optional)**

| Field | Type | Notes |
|---|---|---|
| `advanced` | boolean | Uses the advanced cover letter agent. Defaults to `false`. |

**Behaviour**

1. Builds the job description from the stored text, plus the application and listing URLs, using `crawlJobDescription`.
2. Runs the cover letter agent with the profile, company, title and description. It has a 250-second limit.
3. Replaces the cover letter answer, updates the risk notes with any review warning or fallback note, recalculates readiness and the payload hash, and logs an event.

**Success: `200`**

```json
{
  "coverLetter": "Dear Hiring Manager, ...",
  "mode": "standard",
  "reviewWarning": null,
  "fallbackNote": null,
  "jdSource": "page_text"
}
```

`jdSource` says where the job description came from: `provided` (the stored text), `ats_api`, `listing_page`, `page_text` or `none`.

**Errors**

- `401` `Unauthorized`
- `404` `Application not found.`
- `409` `Withdraw the approval before rewriting the cover letter.` (stage is `applied`, `approved` or `preparing`)
- `409` `Prepare this application first.` (no draft)
- `502` `The cover letter agent returned nothing. Try again.`
- `502` `Cover letter generation is temporarily unavailable. Try again in a moment.`

**Side effects:** writes the draft and job candidate, and logs `cover_letter_rewritten`. Outbound requests to crawl the job description. AI calls: the cover letter agent (section 5).

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/job/<job-id>/cover-letter \
  -H 'Content-Type: application/json' \
  -d '{"advanced":false}'
```

##### `POST /api/auto-apply/job/[jobId]/applied`

- **Exports:** `POST`
- **Auth:** yes

This records the candidate's own statement that they submitted the application on the employer's site. The engine cannot see the employer's confirmation page, so the record is labelled as the candidate's attestation.

**Request body (JSON)**

| Field | Type | Notes |
|---|---|---|
| `confirm` | boolean | Must be `true` to record the submission. |
| `undo` | boolean | Reverses an applied status. |

**Success: `200`**

```json
{ "stage": "applied" }
```

Other success bodies: `{ "stage": "applied", "already": true }` when the application is already applied, and `{ "stage": "approved" }` after an undo.

**Errors**

- `401` `Unauthorized`
- `404` `Application not found.`
- `409` `This application is not marked as applied.` (undo when the stage is not `applied`)
- `400` `Confirm that you submitted this application.`
- `409` `Approve this application before marking it applied.`

**Side effects:** sets the job to `applied` with `appliedAt`, or back to `approved` on undo. Sets the draft to `applied` with `submittedAt`. Logs an `applied` event. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/job/<job-id>/applied \
  -H 'Content-Type: application/json' \
  -d '{"confirm":true}'
```

##### `GET /api/auto-apply/job/[jobId]/pack`

- **Exports:** `GET`
- **Auth:** yes

Returns the autofill pack, which the candidate uses to complete the employer's form by hand. The pack has kind `cva-autofill` and version `1`. It contains the job details, the answers and the cover letter.

**Success: `200`**

```json
{
  "pack": {
    "kind": "cva-autofill",
    "version": 1,
    "job": { "title": "Backend Engineer", "company": "Example Pty Ltd", "applyUrl": "https://boards.greenhouse.io/example/jobs/12345" },
    "answers": [],
    "coverLetter": "Dear Hiring Manager, ..."
  },
  "text": "Backend Engineer at Example Pty Ltd\nApply: https://boards.greenhouse.io/example/jobs/12345\n...",
  "applyUrl": "https://boards.greenhouse.io/example/jobs/12345"
}
```

The example is abbreviated. `text` is the same content as plain text.

**Errors**

- `401` `Unauthorized`
- `404` `Application not found.`
- `409` `Approve this application before opening it.` (stage is not `approved` or `applied`)
- `404` `No prepared application.`

**Side effects:** none. No AI calls.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/job/<job-id>/pack
```

#### 3.9.3 Browser (local development only)

Both browser routes return `404` `Not available.` unless `NODE_ENV` is not `production` and `AUTO_APPLY_DEV_BROWSER` is `true`. They are a local tool and never run in production.

##### `POST /api/auto-apply/job/[jobId]/browser/start`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`

**Request body:** none.

**Behaviour**

1. Starts a Playwright browser session keyed by user, session and application, opens the application URL and captures a screenshot.
2. If the browser cannot continue (a blocker, a required login, or a deployment limit), the route returns `manual_guided` with guidance, and the caller finishes by hand.
3. When the browser is active, it asks the supervisor model for guidance from the screenshot. The call has a 60-second timeout. It is skipped for a known job platform without an employer login, which gets fixed platform guidance instead.

**Success: `200`**

```json
{
  "mode": "browser_active",
  "reason": "",
  "guidance": "Browser preview is live. Continue autonomously through the application flow and ask the user only when a required answer cannot be inferred safely.",
  "blockers": [],
  "screenshotBase64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

`mode` is `browser_active` or `manual_guided`. The `manual_guided` response has the same keys. When the supervisor call fails, `guidance` says so and includes the error message.

**Errors**

- `401` `Unauthorized`
- `404` `Job candidate not found.`
- `404` `Not available.`

**Side effects:** starts a browser process on the server. Logs `browser_started` or `browser_manual_fallback`. One supervisor model call (`hard` tier with the supervisor override) when guidance is needed.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/job/<job-id>/browser/start
```

##### `POST /api/auto-apply/job/[jobId]/browser/action`

- **Exports:** `POST`
- **Auth:** yes
- **Runtime:** `nodejs`, `dynamic = 'force-dynamic'`

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | One of `click`, `type`, `select`, `screenshot`, `read_dom`, `scroll`, `save_site_login`, `stop`. |
| `selector` | string | depends on action | CSS or text selector. |
| `value` | string | depends on action | Text for `type` or an option for `select`. |
| `direction` | string | depends on action | For `scroll`. |
| `url` | string | no | |
| `credentials` | `{ username?, password? }` | no | Passed to the browser helper. |
| `rememberCredentials` | boolean | no | Passed to the browser helper, which uses it when saving site state. |

**Errors**

- `401` `Unauthorized`
- `404` `Job candidate not found.`
- `404` `Not available.`
- `400` `Unsupported browser action.`
- A helper exception, such as `Browser session is not active.` or a selector error, is not caught and returns the framework `500`.

**Success: `200`**

```json
{
  "mode": "browser_active",
  "reason": "",
  "blockers": [],
  "domText": "Apply for this job. First name. Last name. Email. Resume.",
  "screenshotBase64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

The body is the helper's result. `guidance` and `savedSiteAuth` appear when relevant.

**Side effects:** performs the browser action. Logs one event: `browser_action`, `browser_manual_fallback`, `browser_stopped` or `site_login_saved`. The event payload holds the action, the selector, the blockers and whether site auth was saved. It does not hold credentials. `save_site_login` writes the browser storage state to `.codex-data/auto-apply/site-auth/`. See Known gaps, item 13.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/job/<job-id>/browser/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"read_dom"}'
```

#### 3.9.4 Preferences and profile draft

##### `GET /api/auto-apply/preferences`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "preferences": {
    "workRights": "Australian citizen",
    "requiresSponsorship": "no",
    "salaryExpectation": "",
    "noticePeriod": "2 weeks",
    "currentLocation": "Melbourne, VIC",
    "willingToRelocate": "no",
    "hybridOk": "yes",
    "howHeard": "",
    "github": "",
    "currentCompany": "Example Pty Ltd"
  },
  "hasProfile": true,
  "profileName": "Jordan Example"
}
```

`preferences` is the stored object merged with the defaults. `hasProfile` is `true` when the profile has a name or at least one experience.

**Errors:** `401` `Unauthorized`.

**Side effects:** reads the user, the profile and stored memory. No writes. No AI calls.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/auto-apply/preferences
```

##### `PUT /api/auto-apply/preferences`

- **Exports:** `PUT`
- **Auth:** yes

**Request body (JSON)**

Every field is optional and defaults to an empty string. Text fields are trimmed and limited to 200 characters.

| Field | Type | Allowed values |
|---|---|---|
| `workRights` | string | free text |
| `requiresSponsorship` | string | `""`, `yes`, `no` |
| `salaryExpectation` | string | free text |
| `noticePeriod` | string | free text |
| `currentLocation` | string | free text |
| `willingToRelocate` | string | `""`, `yes`, `no` |
| `hybridOk` | string | `""`, `yes`, `no` |
| `howHeard` | string | free text |
| `github` | string | free text |
| `currentCompany` | string | free text |

**Behaviour:** the stored `autoApplyPreferences` object is replaced in full. Any field left out is reset to `""`.

**Success: `200`**

```json
{ "preferences": { "workRights": "Australian citizen", "requiresSponsorship": "no", "currentLocation": "Melbourne, VIC" } }
```

The example is abbreviated. The response holds the parsed object.

**Errors**

- `401` `Unauthorized`
- `400` with the first Zod issue message, or `Invalid preferences.` if there is none

**Side effects:** one User update. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X PUT http://localhost:3000/api/auto-apply/preferences \
  -H 'Content-Type: application/json' \
  -d '{"workRights":"Australian citizen","requiresSponsorship":"no","currentLocation":"Melbourne, VIC","hybridOk":"yes"}'
```

##### `POST /api/auto-apply/profile-draft`

- **Exports:** `POST`
- **Auth:** yes

Drafts Auto Apply settings and the ground-truth options from the profile. The UI uses it to pre-fill the settings form.

**Request body (JSON)**

All fields are optional. None is length-limited, and invalid values are not rejected here.

| Field | Type | Default when missing or of the wrong type |
|---|---|---|
| `prompt` | string | `""` |
| `location` | string | `""` |
| `workplaceMode` | string | `any` |
| `employmentType` | string | `any` |
| `seniority`, `salaryMin`, `salaryMax`, `workRights` | string | `""` |
| `mustHaveKeywords`, `excludeKeywords`, `companyBlacklist` | array | `[]` |
| `applicationLimit` | number | `10` |
| `selectedSources` | array | `undefined` |
| `selectedGroundTruthIds` | array | `[]` |
| `allowFullResumeContext` | boolean | `false` |

**Success: `200`**

```json
{
  "draft": {
    "prompt": "Backend roles in Melbourne",
    "location": "Melbourne, VIC",
    "workplaceMode": "hybrid",
    "applicationLimit": 10,
    "selectedSources": ["seek", "indeed"]
  },
  "groundTruthOptions": [
    { "id": "experience:66a1f0c2e4b0a1b2c3d4e5f6", "kind": "experience", "title": "Software Engineer at Example Pty Ltd", "summary": "Built internal tooling for the operations team.", "evidence": [] }
  ]
}
```

The `draft` object has the shape defined by `profileDraftSchema` in `src/lib/auto-apply/profile-draft.ts`. The example shows some keys only. `groundTruthOptions` lists the profile facts the user can select, with IDs of the form `project:<id>`, `experience:<id>` or `profile:<field>`.

**Errors**

- `401` `Unauthorized`
- An unhandled failure returns the framework `500`. See Known gaps, item 17.

**Side effects:** none. No writes. One `easy` tier request, with the default of two retries (up to three attempts). If the model output is unusable, a fallback draft is built from the submitted values.

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/auto-apply/profile-draft \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Backend roles in Melbourne","location":"Melbourne, VIC","workplaceMode":"hybrid","applicationLimit":10}'
```

### 3.10 Control Room

The Control Room tracks job leads from discovery to tailored application documents. Leads are created by the search stream (section 3.8). The user context snapshot holds the user's targets and preferences. The first call to any Control Room route that loads the snapshot creates a default UserContext document.

#### `GET /api/control-room/overview`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

The body is the overview object. It holds `summary`, `campaigns`, `leads`, `blockerHeatmap`, `heatmapExcludesLegacyHeuristic`, `recommendations` and `pipelineCounts`. The example is abbreviated.

```json
{
  "summary": {},
  "campaigns": [],
  "leads": [],
  "blockerHeatmap": [],
  "heatmapExcludesLegacyHeuristic": false,
  "recommendations": {},
  "pipelineCounts": {}
}
```

**Errors:** `401` `Unauthorized`. A database failure is not caught and returns the framework `500`.

**Side effects:** may create the default UserContext document. One `easy` tier call produces the strategist digest. The call has one retry. If it fails or returns invalid output, the route uses the heuristic copy instead. No other writes.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/control-room/overview
```

#### `GET /api/control-room/context`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "context": {
    "targetRoles": ["Backend Engineer", "Platform Engineer"],
    "searchPreferences": { "jobTitles": ["Backend Engineer"], "locations": ["Melbourne, VIC"], "sources": ["seek", "indeed"], "remoteOnly": false },
    "compensation": { "currency": "AUD", "targetMin": 120000, "targetMax": 145000, "salaryFloor": 110000 },
    "techStackPreferences": ["TypeScript", "PostgreSQL"],
    "cultureSignals": [{ "label": "Small team", "weight": 3 }],
    "proofPoints": [],
    "learnedExclusions": [],
    "scoreFloor": 65,
    "candidateFacts": []
  }
}
```

The snapshot also holds `workPreferences`, `controlRoomPreferences` and the candidate facts derived from the profile. The example is abbreviated.

**Errors:** `401` `Unauthorized`.

**Side effects:** the first call creates the default UserContext document. No AI calls.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/control-room/context
```

#### `PATCH /api/control-room/context`

- **Exports:** `PATCH`
- **Auth:** yes

**Request body (JSON)**

The body must be an object. Only the keys below are read. Other keys are ignored.

| Key | Type | Handling |
|---|---|---|
| `targetRoles` | string[] | Trimmed and de-duplicated. |
| `searchPreferences` | object | `jobTitles`, `locations` and `sources` are de-duplicated string arrays. `remoteOnly` becomes a boolean. |
| `compensation` | object | `currency` (default `AUD`). `targetMin`, `targetMax` and `salaryFloor` become numbers, and non-numeric values become `0`. |
| `workPreferences` | object | Stored as given. See `src/lib/career/context.ts`. |
| `techStackPreferences` | string[] | Trimmed and de-duplicated. |
| `cultureSignals` | `{ label, weight }[]` | Stored as given. |
| `proofPoints` | string[] | Trimmed and de-duplicated. |
| `learnedExclusions` | string[] | Trimmed and de-duplicated. |
| `scoreFloor` | number | Stored only when the value is a number. |
| `controlRoomPreferences` | object | Stored as given. See `src/lib/career/context.ts`. |

**Success: `200`**

```json
{
  "context": {
    "targetRoles": ["Backend Engineer", "Platform Engineer"],
    "scoreFloor": 70
  }
}
```

The response is the updated snapshot. The example is abbreviated.

**Errors**

- `401` `Unauthorized`
- `400` `Invalid context payload.` (the body is missing or is not an object)

**Side effects:** updates the UserContext document. No AI calls.

**Example**

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/control-room/context \
  -H 'Content-Type: application/json' \
  -d '{"targetRoles":["Backend Engineer","Platform Engineer"],"scoreFloor":70}'
```

#### `GET /api/control-room/leads/[leadId]`

- **Exports:** `GET`
- **Auth:** yes

**Success: `200`**

```json
{
  "lead": {
    "_id": "66a1f0c2e4b0a1b2c3d4e5fb",
    "title": "Backend Engineer",
    "company": "Example Pty Ltd",
    "location": "Melbourne VIC",
    "lifecycleState": "scored",
    "fitScore": 82,
    "recommendation": "prioritize"
  },
  "evaluation": {},
  "tailoringRun": null,
  "artifacts": [],
  "events": []
}
```

- `lead` includes derived display fields. These fill gaps in the stored company and location.
- `evaluation` is the latest JobEvaluation, with its dimension scores, gap map and next actions.
- `tailoringRun` and `artifacts` are present once tailoring has run.
- `events` holds the lead's application events.

The example is abbreviated.

**Errors**

- `401` `Unauthorized`
- `404` `Lead not found.` (missing, or owned by another user)
- Every other error is also returned as `404`, with its own message. See Known gaps, item 5.

**Side effects:** no writes. When the lead has a description and the company or location is missing, the route makes one `easy` tier call (one retry) to infer them. The result is used only in the response.

**Example**

```bash
curl -s -b cookies.txt http://localhost:3000/api/control-room/leads/<lead-id>
```

#### `POST /api/control-room/leads/[leadId]/orchestrate`

- **Exports:** `POST`
- **Auth:** yes
- **Request body:** none

This is the full pipeline for one lead. It runs in four steps.

1. **Enrich.** Fetches the lead's detail URL with a 10-second timeout. Extracts a structured job understanding with the `easy` tier (one retry), falling back to heuristics when that fails. Saves the lead as `enriched` and logs an `enriched` event. Throws `Lead not found.` when the lead does not belong to the user.
2. **Score.** Scores fit with the `hard` tier (two retries). The heuristic scorer is used instead when the model fails, when the description is shorter than 40 characters, or when `CONTROL_ROOM_STRATEGIST_MODE` is `heuristic`. Writes a JobEvaluation with `analysisSource` `llm`, `heuristic` or `fallback`. Updates the lead's fit score, recommendation and state (`scored`), and logs a `scored` event.
3. **Filter.** When the recommendation is `skip`, logs a `self_filtered` event and returns the lead detail. No tailoring happens.
4. **Tailor.** Runs resume coaching (`hard` tier), builds a resume draft and checks it against the job's keywords. Creates a TailoringRun with status `exported` when the check passes, or `validated` when it does not. Stores GeneratedArtifacts: resume HTML, resume JSON and cover letter HTML. Logs `tailored` and `exported` events. Sets the lead state to `exported` whether or not the check passed. See Known gaps, item 6.

**Success: `200`**

The response is the lead detail, in the same shape as `GET /api/control-room/leads/[leadId]`.

**Errors**

- `401` `Unauthorized`
- `500` `{ "error": "<message>" }` for any failure. This includes `Lead not found.`, which is returned as `500` here, not `404`.

**Side effects:** several writes to the lead, JobEvaluation, TailoringRun, GeneratedArtifact and ApplicationEvent collections. Outbound request to the lead's detail URL. AI calls: `easy` tier for the job understanding, `hard` tier for the strategist (up to three attempts), and `hard` tier coaching for the tailoring step. This is the most expensive route in the control room (section 5).

**Example**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/control-room/leads/<lead-id>/orchestrate
```

### 3.11 Test and utility

#### `GET /api/test`

- **Exports:** `GET`
- **Auth:** none
- **Request body:** none

**Behaviour:** connects to MongoDB with `connectToDatabase` and reports the result.

**Success: `200`**

```json
{ "status": "ok", "message": "MongoDB connected" }
```

**Errors:** `500`

```json
{ "status": "error", "message": "<error.message from the driver>" }
```

**Side effects:** opens or reuses the shared database connection. Logs to the server console. No writes, no AI calls.

**Example**

```bash
curl -s http://localhost:3000/api/test
```

**Production-safety verdict: not safe to expose in production as written.** The route should be removed from production builds, or restricted to development. The reasons are:

1. There is no authentication, no environment check and no rate limit. Anyone who can reach the host can call the route.
2. On failure it returns the raw driver message. Driver messages can include the host name, the database name or other connection details, so the route discloses infrastructure information.
3. The failure is cached. `connectToDatabase` keeps the rejected promise, so after one failed connection, every later call returns the same error until the process restarts. The route therefore cannot be used as a health check, and it can report a stale failure.

Options, in order of preference: delete the route from production; return `404` when `NODE_ENV` is `production`; or require a valid `auth_token` and return only a generic status with no message. Any of these keeps the route useful for local checks.

## 4. Known gaps and observations

Each item was found by reading the code. Items marked as not executed have not been run against a live database or model. File references are relative to `cv-assistant/`.

1. **Login does not type-check `username`.** `src/app/api/auth/login/route.ts` line 14 passes the raw value to `findOne`. An operator object such as `{"$ne": null}` matches the first user, and a regular expression can match any account whose name fits it. The password check still applies, so this does not bypass authentication. It does let a caller aim guesses at chosen accounts. Fix: require a string.
2. **Registration sets no password rule, and usernames are case-sensitive.** Passwords have no minimum length (`src/app/api/auth/register/route.ts`). `Demo_User` and `demo_user` can both exist.
3. **Several routes parse the body outside a `try` block.** Malformed JSON therefore returns the framework `500`, not a `400`. Affected routes: `POST /api/enhance`, `POST /api/generate/select`, `POST /api/generate/cover-letter/pdf`, `PUT /api/profile`, `POST /api/resume/beautify`, `POST /api/resume/coach`, `POST /api/resume/enhance`, `POST /api/resume/enhance-targeted`, `POST /api/resume/style-parser` and `POST /api/resume/summarize`. Database calls in `POST /api/generate/select` are also outside a `try` block.
4. **`generate-resume` ignores the base path.** `src/app/api/generate-resume/route.ts` line 91 builds the internal URL as `${req.nextUrl.origin}/api/resume/${selectedStyle}`. With `NEXT_PUBLIC_BASE_PATH` set, that path does not exist. The not-found response is passed through to the client. Fix: include the base path, or call the renderer directly instead of making an HTTP request.
5. **Lead routes map errors to the wrong status.** `GET /api/control-room/leads/[leadId]` returns `404` for every error, including database failures. `POST .../orchestrate` returns `500` for `Lead not found.`, which should be `404`. Fix: handle the not-found case explicitly in both routes.
6. **Orchestrate marks leads exported even when validation fails.** `src/lib/career/workflow.ts` lines 118 to 120 and 148 set `lifecycleState` to `exported` without checking the ATS result. The TailoringRun is stored as `validated` in that case, but the lead still reads as exported.
7. **The test route is exposed.** See section 3.11 for the verdict.
8. **A failed database connection is cached.** `src/lib/db.ts` lines 22 to 25 keep a rejected promise in `global.mongoose`. After one failed connection, every request fails until the process restarts. Fix: clear `state.promise` when the connection rejects.
9. **`reviewedHashes` cannot be used by the bundled UI.** `POST /api/auto-apply/session/[id]/approve` skips applications whose payload hash differs from `reviewedHashes`. No route returns `payloadHash`, and the UI does not send `reviewedHashes`. The check is therefore inactive unless a client recomputes the canonical hash itself.
10. **Some approval skips are not reported.** In `approve/route.ts` lines 62 to 64, an application that loses the atomic claim is dropped without being added to `skipped`.
11. **Stage changes are written before answer checks.** `auto-apply/job/[jobId]/route.ts` writes a stage change at lines 69 to 72, before the `409` checks at lines 73 to 78. A request that carries both a stage and an answer edit can therefore leave the stage changed when the answer edit is refused.
12. **Session prompt length is not limited on PATCH.** Create limits `prompt` to 4,000 characters (`src/lib/auto-apply/types.ts` line 72). Update uses `z.string().trim().optional()` (line 80) with no maximum.
13. **Site login state is stored in plain text on disk.** `save_site_login` writes the browser storage state under `.codex-data/auto-apply/site-auth/` as plain JSON. Only the credential secret is encrypted (AES-256-GCM, `src/lib/auto-apply/site-auth.ts`). The encryption key comes from `AUTO_APPLY_SITE_AUTH_SECRET`, then `JWT_SECRET`, then the fixed string `cv-assistant-site-auth`. The browser routes also accept plaintext credentials in the request body. They are restricted to local development, which is the only protection.
14. **Tokens cannot be revoked.** Logout clears the cookie only. A copied token remains valid until its seven-day expiry.
15. **Upload and format errors return `500`.** `POST /api/ocr` returns `500` for an unsupported file type, a PDF over 12 pages, and an unreadable PDF. These are client errors and should return `4xx`.
16. **Search validation hides the reason.** `POST /api/search/advanced` returns the same message, `Job title and location are required.`, for every schema failure, including an empty `selectedSources` array. `POST /api/search/advanced-sequential` checks only the title and location, and sets no length limits.
17. **The profile draft fallback may throw.** `src/lib/auto-apply/profile-draft.ts` lines 317 to 318 return `fallbackDraft(...)` from a `catch` block without a guard. If that function parses invalid submitted values, such as an unknown enum or an `applicationLimit` outside 1 to 100, the route returns the framework `500`. This was inferred from the code and not executed.
18. **Style parsing fails inconsistently.** `POST /api/resume/style-parser` returns `500` when the model reply contains no JSON. It returns `200` with defaults when the model call or the JSON parse fails.
19. **Internal error messages reach clients.** Register (`error.message`), OCR, the lead routes, the test route, and the browser-start guidance text all return internal messages.
20. **Some code is unused.** `saveAnswerSchema`, `answerQuestionSchema` and `submitApplicationSchema` in `src/lib/auto-apply/types.ts` (lines 86 to 105) are not imported anywhere. The `AutoApplyUploadedFile` model has no writer in the routes or the library code.
21. **Several routes are not called by the bundled UI.** A search of `src/components`, `src/app` and `src/hooks` finds no caller for `POST /api/auto-apply/profile-draft`, `GET /api/auto-apply/session/[id]/events`, the two browser routes, `POST /api/search/advanced` (the search page uses `advanced-sequential`), `POST /api/resume/enhance`, `POST /api/resume/summarize`, `POST /api/resume/coach` or `POST /api/resume/style-parser`.
22. **The README is out of date.** The API section of the root `README.md` documents `POST /api/profile`, omits most routes, and describes CORS and rate limiting, which the code does not implement.
23. **Missing users are handled inconsistently.** `GET /api/profile` returns `200` with `profile: null` for a missing user. `PUT /api/profile` returns `404` `User not found`.

## 5. Routes by AI tier and cost

The AI layer (`src/lib/ai.ts`) offers four presets. The model behind each preset, the failover order and the timeouts come from environment variables. See `ai-layer.md` in this folder.

| Preset or agent | Used for |
|---|---|
| `easy` | Short structured tasks: summaries, extraction, classification, digests, fit scoring, and the claim check. |
| `hard` | Writing and coaching: cover letters, employer answers, resume coaching, strategist scoring, and enhancement. |
| `document` | Profile import from PDFs (page images included) and text. |
| Supervisor | `getAutoApplySupervisorModel()`. The `hard` preset with the `NVIDIA_NIM_SUPERVISOR_MODEL` override, used for screenshot guidance. |
| Cover letter agent | Drafting uses the `easy` preset with model overrides from `COVER_LETTER_MODELS` (`src/lib/cover-letter-service.ts`). Letter verification uses `hard`. |

`generateJsonSafe(preset, prompt, maxRetries = 2)` makes `maxRetries + 1` attempts. The default is therefore three attempts. Counts in the table are per request and assume the first attempt succeeds. Retries and fallbacks increase them.

| Route | Tier | Requests (typical) | Notes |
|---|---|---|---|
| `POST /api/ocr` | `document` | up to 3 | One per import attempt. Page images add input size. |
| `GET`, `PUT /api/profile` | `easy` | 1 per refreshed item | `PUT` returns `500` if a summary call fails. |
| `POST /api/enhance` | `hard` | 1 | |
| `POST /api/generate/clarifications` | `easy` | 2 or 3 | Two in the first step, and one more when fewer than two questions come back. 50-second limit. |
| `POST /api/generate/select` | `hard` | up to 2 | |
| `POST /api/generate/cover-letter` | `hard`, `easy`; advanced: multi-agent | 3 standard, more when advanced | Followed by the claim check (`easy`, one attempt, 18 seconds). 240-second limit. |
| `POST /api/generate/employer-question` | as above | as above | |
| `POST /api/generate/cover-letter/pdf` | none | 0 | |
| `POST /api/generate-resume` | `hard` (coaching), then the style route | 3, plus one per item and rewrite | Coaching only. The style route's calls are listed below. |
| `POST /api/resume/style1` to `style5` | `hard` (`enhance`), `easy` (narrative) | 1 per skills line, experience and project with `enhance`; 1 narrative | Zero when neither `enhance` nor `autoFit` with a job description is set. |
| `POST /api/resume/beautify` | `hard` | 1 | |
| `POST /api/resume/coach` | `hard` | 1 | Content agent only. The styling agent makes no call. |
| `POST /api/resume/enhance` | `easy` | 1 | |
| `POST /api/resume/enhance-targeted` | `hard` | 1 | |
| `POST /api/resume/style-parser` | `easy` | 1 | |
| `POST /api/resume/summarize` | `easy` | 1 | |
| `POST /api/search/advanced` | `easy` | up to 2 | |
| `POST /api/search/advanced-sequential` | `easy` | up to 2 | |
| `POST /api/search/jobs/stream` | `easy` | up to 2 | One call before the stream starts. |
| `POST /api/auto-apply/session/[id]/run` | `easy`, cover letter agent | scales with the number of jobs | Fit scoring runs in batches of six with concurrency four, and falls back to heuristics per batch. The highest-cost Auto Apply route. |
| `POST /api/auto-apply/job/[jobId]/prepare` | `easy`, cover letter agent | up to 2 for answers, plus the letter agent | |
| `POST /api/auto-apply/job/[jobId]/cover-letter` | cover letter agent | several | The advanced option is the costliest single Auto Apply action. |
| `POST /api/auto-apply/job/[jobId]/browser/start` | `hard` (supervisor) | 1 | Only when guidance is needed. Skipped for a known job platform without an employer login. |
| `POST /api/auto-apply/profile-draft` | `easy` | up to 3 | |
| `GET /api/control-room/overview` | `easy` | up to 2 | |
| `GET /api/control-room/leads/[leadId]` | `easy` | up to 2 | Only when the company or location must be inferred. |
| `POST /api/control-room/leads/[leadId]/orchestrate` | `easy`, `hard` (strategist), `hard` (coaching) | many | The most expensive control room route. |

The following routes make no AI calls: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/register`, `GET /api/profile`, `GET /api/test`, `GET` and `POST /api/auto-apply/session`, `GET` and `PATCH /api/auto-apply/session/[id]`, `POST /api/auto-apply/session/[id]/cancel`, `GET /api/auto-apply/session/[id]/events`, `POST /api/auto-apply/session/[id]/refresh-answers`, `POST /api/auto-apply/session/[id]/approve`, `GET` and `PATCH /api/auto-apply/job/[jobId]`, `POST /api/auto-apply/job/[jobId]/applied`, `GET /api/auto-apply/job/[jobId]/pack`, `POST /api/auto-apply/job/[jobId]/browser/action`, `GET` and `PUT /api/auto-apply/preferences`, `GET` and `PATCH /api/control-room/context`, and `POST /api/generate/cover-letter/pdf`.

**Cost ranking, highest first:** `POST /api/control-room/leads/[leadId]/orchestrate`, `POST /api/generate-resume` with coaching, `POST /api/auto-apply/session/[id]/run`, and advanced-mode cover letters (`POST /api/generate/cover-letter`, `POST /api/generate/employer-question` and `POST /api/auto-apply/job/[jobId]/cover-letter`). Each advanced request can run several agent steps and each step can retry.

