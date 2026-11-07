# Configuration reference

Derived from the source on 2026-11-07. Paths are relative to `cv-assistant/` unless stated otherwise. Variable names are listed exactly as the code reads them. No secret values are recorded in this document.

## Contents

1. Where configuration lives
2. Environment variables
3. How the environment files are used
4. `.env.local` template
5. `next.config.ts`
6. Middleware
7. `vercel.json`
8. `package.json` scripts
9. TypeScript (`tsconfig.json`)
10. ESLint
11. Tailwind CSS, PostCSS and theming
12. Other files

## 1. Where configuration lives

| Concern | Location |
|---|---|
| Runtime settings | Environment variables, read with `process.env` (section 2) |
| Framework build and runtime | `next.config.ts` (section 5) |
| Request guard | `middleware.ts` at the project root, which re-exports `src/middleware.ts` (section 6) |
| Deployment | `vercel.json` (section 7) |
| Scripts and dependencies | `package.json` (section 8) |
| Type checking | `tsconfig.json` (section 9) |
| Linting | `eslint.config.mjs` (section 10) |
| Styling | `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx` (section 11) |
| Local env files | `.env`, `.env.local`, `.env.test.local` (section 3) |
| Repository and upload exclusions | `.gitignore` and `.vercelignore` (section 12) |

## 2. Environment variables

The table lists every environment variable read by `src/`, `scripts/`, `tests/`, `evals/` and the configuration files. The search was a grep for `process.env` and for the literal names passed to the NIM helpers (`getConfigValue` and `positiveInt` in `src/lib/ai.ts`).

"Required" means the feature fails without the variable. The application starts without most of them.

### 2.1 Core

| Variable | Read in | Purpose | Default | Required | Example placeholder |
|---|---|---|---|---|---|
| `MONGO_URI` | `src/lib/db.ts` (line 4) | MongoDB connection string. The database name is fixed to `cv_assistant` in the same file | None. Throws `Missing MONGO_URI in environment` | Yes, for every route that uses the database | `mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority` |
| `JWT_SECRET` | `src/lib/auth.ts` (line 5). Also the fallback in `src/lib/auto-apply/site-auth.ts` (line 24) | Signs the `auth_token` JWT (seven-day expiry). Signing throws `Missing JWT_SECRET in environment` when unset | None | Yes | `<long-random-string>` |
| `NODE_ENV` | `src/lib/auth.ts` (line 31); `src/lib/auto-apply/browser-session.ts` (lines 45 and 51) | Set by Node, Next.js or Vercel. Makes the auth cookie `Secure` in production, and gates the development browser preview | Set by the runtime (`production` for `next start` and Vercel deployments) | Set by the runtime | `production` |
| `NEXT_RUNTIME` | `src/instrumentation.ts` (line 2) | Set by Next.js for each runtime. The NIM key check runs only when it is `nodejs` | Set by Next.js | Set by Next.js | None |

### 2.2 NVIDIA NIM (`src/lib/ai.ts`)

| Variable | Read in | Purpose | Default | Required | Example placeholder |
|---|---|---|---|---|---|
| `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9` | `src/lib/ai.ts` (line 36); `src/instrumentation.ts` (line 4) | NIM API keys, rotated across calls. Empty values are ignored and duplicates count once | None | At least one, for any AI feature | `<nvidia-nim-api-key>` |
| `NVIDIA_NIM_BASE_URL` | `src/lib/ai.ts` (line 162) | OpenAI-compatible base URL. Trailing slashes are removed | `https://integrate.api.nvidia.com/v1` | No | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_NIM_EASY_MODELS` | `src/lib/ai.ts` (line 61) | Comma-separated model ids for the `easy` tier. Replaces the default list | `poolside/laguna-xs-2.1`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-ultra-550b-a55b` | No | `<model-id>,<model-id>` |
| `NVIDIA_NIM_HARD_MODELS` | `src/lib/ai.ts` (line 61) | Model ids for the `hard` tier | `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-ai/deepseek-v4.1-flash` | No | `<model-id>,<model-id>` |
| `NVIDIA_NIM_DOCUMENT_MODELS` | `src/lib/ai.ts` (line 61) | Model ids for the `document` tier (profile import) | Same three ids as `hard` | No | `<model-id>,<model-id>` |
| `NVIDIA_NIM_VISION_MODELS` | `src/lib/ai.ts` (line 190) | Model ids used when a request contains an image | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `stepfun-ai/step-5-preview` | No | `<vision-model-id>` |
| `NVIDIA_NIM_SUPERVISOR_MODEL` | `src/lib/ai.ts` (lines 70 and 245) | Single text model for Auto Apply browser guidance | Unset: the `hard` cascade | No | `<model-id>` |
| `NVIDIA_NIM_MAX_TOKENS` | `src/lib/ai.ts` (line 166) | Upper bound on `max_tokens`, further capped per model (see the AI layer document) | `65536` | No | `65536` |
| `NVIDIA_NIM_TIMEOUT_S` | `src/lib/ai.ts` (line 193) | Overall budget for one model call across all attempts, in seconds | `240` | No | `240` |
| `NVIDIA_NIM_IDLE_TIMEOUT_S` | `src/lib/ai.ts` (line 157) | Maximum silence between streamed chunks, in seconds | `90` | No | `90` |
| `NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S` | `src/lib/ai.ts` (line 160) | Maximum wait for the first chunk, in seconds. Defaults vary by model | `20` (`55` for `stepfun-ai/step-5-preview`, `75` for `deepseek-ai/deepseek-v4.1-flash`) | No | `20` |

### 2.3 Application and routing

| Variable | Read in | Purpose | Default | Required | Example placeholder |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | `next.config.ts` (line 15); `src/lib/api.ts` (line 4) | Mounts the app under a sub-path. Read at build time by the config and inlined into client code. Trimmed, trailing slashes removed, leading slash added | Empty: the app is served at the root | No | `/cv-assistant` |

### 2.4 Auto Apply and career

| Variable | Read in | Purpose | Default | Required | Example placeholder |
|---|---|---|---|---|---|
| `AUTO_APPLY_SITE_AUTH_SECRET` | `src/lib/auto-apply/site-auth.ts` (line 24) | Key material for AES-256-GCM encryption of remembered site credentials. The key is the SHA-256 of this value | Falls back to `JWT_SECRET`, then to the literal `cv-assistant-site-auth` | Strongly recommended | `<long-random-string>` |
| `AUTO_APPLY_DEV_BROWSER` | `src/lib/auto-apply/browser-session.ts` (line 45) | Set to `true` to enable the visible Playwright preview. Only takes effect when `NODE_ENV` is not `production` | Disabled | No | `true` (local development only) |
| `AUTO_APPLY_BROWSER_HEADLESS` | `src/lib/auto-apply/browser-session.ts` (lines 49 and 50) | `true` forces headless mode. `false` forces a visible window | Headless only when `NODE_ENV` is `production` | No | `false` |
| `CONTROL_ROOM_STRATEGIST_MODE` | `src/lib/career/career-strategist.ts` (line 380) | `heuristic` disables the LLM strategist and uses heuristic scoring only | Unset: LLM strategist, with heuristic fallback | No | `heuristic` |

### 2.5 Tests and evaluation only

These variables are set or cleared inside test files, or by the evaluation loader. They are not read by the application.

| Variable | Set in | Purpose |
|---|---|---|
| `NVIDIA_NIM_API_KEY_1` | `tests/ai/run-tests.ts` (line 9), `tests/generate/cancellation-tests.ts` (lines 10 and 19), `tests/generate/claim-check-tests.ts` (lines 9 and 31) | Fake key so the client can run against a stubbed `fetch` |
| `NVIDIA_NIM_EASY_MODELS` | `tests/ai/run-tests.ts` (lines 13, 18 and 25), `tests/generate/claim-check-tests.ts` (line 8) | Test model lists |
| `NVIDIA_NIM_HARD_MODELS`, `NVIDIA_NIM_DOCUMENT_MODELS`, `NVIDIA_NIM_SUPERVISOR_MODEL` | `tests/career/run-tests.ts` (lines 159 to 162) | Test model lists, restored after each test |
| `NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S` | `tests/ai/run-tests.ts` (lines 33 and 43) | Forces a short first-token timeout |
| `CONTROL_ROOM_STRATEGIST_MODE` | `tests/career/run-tests.ts` (line 19) | Forces heuristic mode for the career tests |
| `NODE_ENV` | `tests/career/run-tests.ts` (lines 205, 209, 219 and 220) | Set to `production` for the browser-gating test, then restored |
| `AUTO_APPLY_BROWSER_ENABLED` | `tests/career/run-tests.ts` (lines 206, 210, 221 and 222) | Saved, deleted and restored. **No source file reads this name**, so setting it has no effect |
| `AUTO_APPLY_BROWSER_HEADLESS` | `tests/career/run-tests.ts` (lines 207, 211, 223 and 224) | Saved, deleted and restored around the browser-gating test |
| `SUCRASE_OPTIONS` | `tests/generate/clarifications-ui.test.ts` (line 4) | Passes `jsxRuntime: automatic` to the Sucrase transform |

The evaluation loader `evals/run-letter.ts` (lines 6 to 11) reads `.env` and `.env.local` itself. It sets only variables that are not already set. See section 3.

### 2.6 Names that appear in local environment files but no code reads

The names below appear in the local files. A search of `src/`, `scripts/`, `tests/`, `evals/`, `README.md` and the configuration files found no reader for them. Values are deliberately not recorded.

| File | Names |
|---|---|
| `.env` | `AZURE_AI_FOUNDRY_ENDPOINT`, `AZURE_AI_FOUNDRY_API_KEY`, `GEMINI_API` |
| `.env.test.local` | `E2E_TEST_USERNAME`, `E2E_TEST_PASSWORD`, `USER_TEST_USERNAME`, `USER_TEST_PASSWORD` |

The Azure and Gemini names are not used because no code calls those providers (see the AI layer document). The four test-login names have no test runner in this repository that reads them. There is no Playwright configuration file, and no code or script refers to them.

`NVIDIA_API_KEY` is mentioned in `evals/promptfooconfig.yaml` (line 1) and in the root README. No code reads it. The code reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9`.

## 3. How the environment files are used

| File | Who reads it | Notes |
|---|---|---|
| `.env` | Next.js (`next dev`, `next build`, `next start`), using its standard precedence. `evals/run-letter.ts` also parses it by hand | Git-ignored by `.env*` in `.gitignore`. Excluded from Vercel uploads by `**/.env` in `.vercelignore` |
| `.env.local` | Next.js, with higher precedence than `.env`. `evals/run-letter.ts` parses it by hand | Git-ignored. Excluded from uploads by `**/.env.*` in `.vercelignore` |
| `.env.test.local` | Next.js loads it only when `NODE_ENV` is `test`. None of the repository's npm scripts sets that | Git-ignored. Excluded from uploads by `**/.env.*` |

Points to note:

- **Only Next.js loads these files, and only through `next` commands.** The test scripts run plain `node` with `tsconfig-paths` and `sucrase`, so they do not read `.env` files. Export variables in the shell, or rely on the values the tests set themselves.
- **The evaluation loader is custom.** `evals/run-letter.ts` reads `.env` and `.env.local` with the pattern `^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$`, strips one leading and one trailing quote, and never overwrites a variable that is already set. It does not read `.env.test.local`.
- **`.env*` is ignored by Git**, including any `.env.example`. If you need a committed example, give it a different name, such as `env.example`.
- **Vercel environment variables** are set in the Vercel project, not in these files. The `.vercelignore` rules keep the files out of the upload.
- **`NEXT_PUBLIC_BASE_PATH` is special.** The `NEXT_PUBLIC_` prefix means the value is embedded into the client bundle at build time, so changing it needs a rebuild.

## 4. `.env.local` template

Copy this to `cv-assistant/.env.local` and replace each placeholder. Do not commit the completed file.

```dotenv
# cv-assistant/.env.local
# Replace every <placeholder>. Leave optional lines commented out until needed.

# ---- Required ----
MONGO_URI=<mongodb-connection-string>
JWT_SECRET=<long-random-string>

# ---- NVIDIA NIM: set at least one key. Empty slots are ignored. ----
NVIDIA_NIM_API_KEY_1=<nvidia-nim-api-key>
NVIDIA_NIM_API_KEY_2=
NVIDIA_NIM_API_KEY_3=
NVIDIA_NIM_API_KEY_4=
NVIDIA_NIM_API_KEY_5=
NVIDIA_NIM_API_KEY_6=
NVIDIA_NIM_API_KEY_7=
NVIDIA_NIM_API_KEY_8=
NVIDIA_NIM_API_KEY_9=

# ---- NVIDIA NIM: optional tuning (defaults are in section 2.2) ----
# NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
# NVIDIA_NIM_EASY_MODELS=<model-id>,<model-id>
# NVIDIA_NIM_HARD_MODELS=<model-id>,<model-id>
# NVIDIA_NIM_DOCUMENT_MODELS=<model-id>,<model-id>
# NVIDIA_NIM_VISION_MODELS=<model-id>,<model-id>
# NVIDIA_NIM_SUPERVISOR_MODEL=<model-id>
# NVIDIA_NIM_MAX_TOKENS=65536
# NVIDIA_NIM_TIMEOUT_S=240
# NVIDIA_NIM_IDLE_TIMEOUT_S=90
# NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S=20

# ---- Application ----
# Sub-path mount. Set before `next build` and keep it the same for `next start`.
# NEXT_PUBLIC_BASE_PATH=/<sub-path>

# ---- Auto Apply and career (optional) ----
# AUTO_APPLY_SITE_AUTH_SECRET=<long-random-string>
# AUTO_APPLY_DEV_BROWSER=true
# AUTO_APPLY_BROWSER_HEADLESS=false
# CONTROL_ROOM_STRATEGIST_MODE=heuristic
```

`JWT_SECRET` has no minimum length in the code. Use a long random value anyway.

## 5. `next.config.ts`

The file has four settings: a normalised `basePath`, `serverExternalPackages`, `outputFileTracingIncludes`, and a webpack hook.

```ts
// Normalisation of NEXT_PUBLIC_BASE_PATH (abridged)
function normalizeConfiguredBasePath(value?: string) { /* trim, strip trailing "/", ensure leading "/" */ }
const configuredBasePath = normalizeConfiguredBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  ...(configuredBasePath ? { basePath: configuredBasePath } : {}),
  serverExternalPackages: ["mongoose", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/ocr": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas-linux-*/**/*",
    ],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), "bcrypt"];
    return config;
  },
};
```

| Setting | Effect |
|---|---|
| `basePath` | Set only when `NEXT_PUBLIC_BASE_PATH` is non-empty after normalisation. All pages and routes move under it |
| `serverExternalPackages` | `mongoose`, `pdfjs-dist` and `@napi-rs/canvas` are loaded from `node_modules` at runtime instead of being bundled |
| `outputFileTracingIncludes` for `/api/ocr` | Adds the pdf.js worker module and the Linux `@napi-rs/canvas` binaries to that route's function bundle. Only `/api/ocr` has this entry |
| `webpack` externals | Adds `bcrypt` to the webpack externals so it is loaded at runtime. The `dev` and `build` scripts do not pass `--turbopack`, so this hook applies |

No `headers()`, `rewrites()`, `redirects()`, `images`, `typescript` or `eslint` settings are defined. In particular, the build does not ignore type or lint errors, because neither `typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds` is set.

## 6. Middleware

Root `middleware.ts` contains only `export { middleware, config } from './src/middleware';`. The logic is in `src/middleware.ts`.

| Setting | Value |
|---|---|
| Matcher | `/((?!_next/\|favicon.ico).*)` |
| Skipped by logic | Paths beginning with `/login`, and paths beginning with `/api` |
| Check | Presence of the `auth_token` cookie. The JWT is **not** verified here |
| Action when absent | Redirect to `${basePath}/login` |
| On error | Fails open: returns `NextResponse.next()` |

The matcher also covers files in `public/` other than `favicon.ico`, such as `/favicon.svg`. An unauthenticated request for one of them is redirected to the login page.

## 7. `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

`vercel.json` sets no function durations, regions, crons, rewrites, redirects, headers, firewall rules or environment variables. Per-route duration is set in the route files (see the deployment document). The file lives in `cv-assistant/`, so the Vercel project must build from that folder.

## 8. `package.json` scripts

| Script | Command | Notes |
|---|---|---|
| `dev` | `next dev` | Development server on port 3000 by default |
| `build` | `next build` | Production build |
| `start` | `next start` | Serves a previous build |
| `lint` | `eslint` | Flat config in `eslint.config.mjs` |
| `test:unit` | `node -r tsconfig-paths/register -r sucrase/register/ts tests/career/run-tests.ts` | Career tests |
| `test:search` | Same runner, `tests/search/run-tests.ts` | Search tests |
| `test:ai` | Same runner, `tests/ai/run-tests.ts` | NIM client tests |
| `test:auto-apply` | Same runner, `tests/auto-apply/run-tests.ts` | Auto Apply and guard tests |
| `verify:career` | `npm run lint && npm run test:unit && npm run test:auto-apply` | Combined check |
| `test:autofill-safari` | Same runner, `scripts/autofill-safari.ts` | macOS Safari, through `safaridriver` |
| `test:autofill-live` | Same runner, `scripts/autofill-live.ts` | Live job-board forms with Playwright |
| `agent:fill` | Same runner, `scripts/agent-fill.ts` | Fills a form from a pack file. Example: `npm run agent:fill -- --pack pack.json [--resume <pdf>] [--headless] [--engine chromium\|firefox\|webkit]` |
| `eval:letters` | `npx --yes promptfoo@0.125.1 eval -c evals/promptfooconfig.yaml --no-cache` | Real NIM calls |

Dependencies of note (from `package.json`):

- Runtime: `next` 15.5.15, `react` and `react-dom` 19.1.0, `mongoose` ^8.17.2, `bcrypt` ^6.0.0, `jsonwebtoken` 9.0.3, `playwright` ^1.60.0, `pdfjs-dist` ^4.10.38, `@napi-rs/canvas` ^0.1.100, `pdf-lib` ^1.17.1, `@pdf-lib/fontkit` ^1.1.1, `mammoth` ^1.12.0, `cheerio` ^1.2.0, `zod` ^4.0.17, `framer-motion` ^12.38.0, `formidable` ^3.5.4.
- Dev: `typescript` ^5, `tailwindcss` ^3.4.1, `eslint` ^9, `eslint-config-next` 15.5.15, `tsconfig-paths` ^4.2.0, `@types/node` ^20.

Dependency notes:

- **`formidable` is declared but not imported** anywhere in `src/`, `scripts/`, `tests/` or `evals/`.
- **`sucrase` is not declared.** The test scripts load `sucrase/register/ts`, which works because `tailwindcss` 3.x depends on `sucrase` and npm hoists it. `package-lock.json` marks it as a development package.
- **`package.json` has no `engines` field** and the repository has no `.nvmrc`. See the deployment document for the Node version expectation.

## 9. TypeScript (`tsconfig.json`)

| Option | Value | Effect |
|---|---|---|
| `target` | `ES2018` | Output language level (not used for emit, since `noEmit` is set) |
| `lib` | `dom`, `dom.iterable`, `esnext` | Type libraries |
| `strict` | `true` | Strict type checking |
| `noEmit` | `true` | Next.js compiles the code |
| `module` / `moduleResolution` | `esnext` / `bundler` | Bundler-style resolution |
| `jsx` | `preserve` | Next.js handles JSX |
| `isolatedModules` | `true` | Required for Next.js transpilation |
| `incremental` | `true` | Writes `tsconfig.tsbuildinfo` (git-ignored) |
| `allowJs`, `skipLibCheck`, `resolveJsonModule`, `esModuleInterop` | `true` | Interop settings |
| `paths` | `"@/*": ["./src/*"]` | The `@/` import alias |
| `plugins` | `next` | Next.js editor plugin |
| `include` | `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts` | Covers `scripts/` and `evals/` as well as `src/` |
| `exclude` | `node_modules`, `tests` | Tests are not type-checked by the project configuration |

## 10. ESLint

`eslint.config.mjs` uses flat config with `FlatCompat`, extending `next/core-web-vitals` and `next/typescript`. It ignores `node_modules/**`, `.next/**`, `out/**`, `build/**` and `next-env.d.ts`. It defines no custom rules. `npm run lint` runs `eslint` with no path, so the whole project is linted, including `tests/`.

## 11. Tailwind CSS, PostCSS and theming

### 11.1 PostCSS

`postcss.config.mjs` loads `tailwindcss` and `autoprefixer`.

### 11.2 `tailwind.config.ts`

Tailwind CSS 3.x (`^3.4.1`). The file is CommonJS (`module.exports`) inside a `.ts` file.

| Setting | Value |
|---|---|
| `darkMode` | `["class"]`. Dark variants apply under a `.dark` class on an ancestor (in practice, `<html>`) |
| `content` | `./src/pages/**`, `./src/components/**`, `./src/app/**`. `./src/pages` does not exist. `./src/lib` is not scanned, so a class name that appears only in `src/lib` is not generated |
| Colours | Mapped to CSS variables as `hsl(var(--name))`: `border`, `input`, `ring`, `background`, `foreground`, `primary` (`DEFAULT`, `foreground`), `secondary`, `destructive`, `muted`, `accent`, `popover`, `card` |
| `borderRadius` | `lg` = `var(--radius)`, `md` = `calc(var(--radius) - 2px)`, `sm` = `calc(var(--radius) - 4px)` |
| `animation` | `fade-in` (0.5 s fadeIn), `slide-up` (0.3 s slideUp), `bounce-in` (0.6 s bounceIn), `pulse-slow` (3 s pulse) |
| `plugins` | None |

The `fontFamily` theme is **not** extended in `tailwind.config.ts`. Fonts are set in other places (section 11.3).

### 11.3 Fonts

`src/app/layout.tsx` loads two local variable fonts with `next/font/local`:

| Font file | CSS variable | Weight range |
|---|---|---|
| `public/fonts/Manrope-Variable.ttf` | `--font-body` | 200 to 800 |
| `public/fonts/Fraunces-Variable.ttf` | `--font-display` | 100 to 900 |

The two variables are added to `<body>` as classes. `src/app/globals.css` sets `font-family: var(--font-body), sans-serif` on the body (around line 102), and defines a `.font-display` utility that uses `var(--font-display), serif` (around line 185).

The `public/fonts` folder also contains `NotoSans-Regular.ttf` and `NotoSans-Bold.ttf`. These are not used by `next/font`. The PDF renderer reads them with `fs.readFileSync` (section 11.5 of the deployment document).

### 11.4 Colour tokens and dark mode

`src/app/globals.css` defines the palette as HSL triplets (for example `--background: 228 42% 7%`) inside `@layer base`.

- `:root` holds the **dark** palette, which is the default.
- `.light` (around line 45) redefines the same variables with the light palette.
- Additional tokens are defined in both blocks and used directly in CSS but not mapped in `tailwind.config.ts`: `--warm`, `--hero-foreground`, `--hero-muted`, `--kicker`, `--shadow-color`, `--success`, `--success-soft`, `--warning`, `--warning-soft`, `--info`, `--info-soft`, `--danger` and `--danger-soft`.

Theme selection:

1. `src/app/layout.tsx` contains an inline script that runs before React mounts. It reads `localStorage["theme"]`. If that is empty, it uses `prefers-color-scheme: dark`. It then sets `light` or `dark` on `<html>`. `<html>` has `suppressHydrationWarning`.
2. `src/contexts/ThemeContext.tsx` reads the class on mount, provides `toggleTheme`, and writes the chosen theme back to `localStorage["theme"]` and to the `<html>` class.

The result: a saved choice wins, otherwise the system preference is used, and with no system preference the theme is light.

Mount order matters. `ThemeProvider` starts with `useState("dark")`. On mount, its second effect runs with that initial value before the first effect's update is applied. A visitor whose resolved theme is light can therefore see the dark class and `localStorage["theme"] = "dark"` for a moment, until the next render writes the correct value. The final state is correct.

## 12. Other files

| File | Contents relevant to configuration |
|---|---|
| `cv-assistant/.gitignore` | Ignores `/.next/`, `/out/`, `/build`, `.env*`, `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`, `/idea` and `.codex-data/`. The `.env*` rule also ignores any committed example file that starts with `.env` |
| `.vercelignore` (repository root, one level above `cv-assistant/`) | Excludes `**/.env`, `**/.env.*`, `**/node_modules`, `**/.next` and `.git` from uploads |
| `src/instrumentation.ts` | Runs on server start in the Node.js runtime. Logs the number of distinct NIM keys, or a warning when there are none |
| `src/app/layout.tsx` | Page metadata: title `CV Assistant \| Premium Career Storytelling`, favicon `/favicon.svg` |
| `next-env.d.ts` | Generated by Next.js. Listed in `.gitignore` although the file exists in the working tree |

### 12.1 Notes on the repository layout

- The Vercel link metadata (`.vercel/`) and `.vercelignore` are at the repository root. The application files (`package.json`, `next.config.ts`, `vercel.json`) are in `cv-assistant/`. The repository does not record the Vercel Root Directory setting. See the deployment document.
- `graphify-out/` exists inside `cv-assistant/`. It is not used by the application or by any script in `package.json`.
