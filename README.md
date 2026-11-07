# CV Assistant

CV Assistant is an AI-assisted career workspace. It keeps one source of truth for your profile, then uses it to build tailored resumes, cover letters, job searches and assisted applications. The app is built with Next.js 15, React 19, TypeScript, Tailwind CSS, MongoDB and NVIDIA NIM.

**Live demo:** [cva-mauve.vercel.app](https://cva-mauve.vercel.app/)

## What it does

| Module | Route | Purpose |
|---|---|---|
| Profile | `/profile` | Store your contact details, professional summary, skills, experiences and projects. Import from pasted text, DOCX or PDF, including scanned pages. |
| Resume Lab | `/resume` | Select the experience and projects to include, rank them against a job description, optionally coach the wording and styling, then render a PDF in one of five templates. |
| Cover Letter | `/generate` | Generate a cover letter from a job brief and your evidence, with clarification questions, a claim check and an optional multi-step Advanced Mode. |
| Job Search | `/search` | Search several job boards at once with filters, stream results as they arrive and save campaigns. |
| Auto Apply | `/auto-apply` | Find roles, read each employer's real application form, and prepare complete applications. **You always submit them yourself.** |
| Control Room | `/control-room` | Score saved leads against your evidence, map skill gaps, and tailor and export application material. |

Every module reads from the same profile, so a fact you add once is available everywhere, and every generated claim is checked against that profile.

## Screenshots

### Sign in and home

| Sign in | Create account |
|---|---|
| ![Sign in](./imgsrc/auth/login.png) | ![Create account](./imgsrc/auth/register.png) |

| Home (light) | Home (dark) |
|---|---|
| ![Home, light theme](./imgsrc/home/home-light.png) | ![Home, dark theme](./imgsrc/home/home-dark.png) |

| Mobile home | Mobile navigation |
|---|---|
| ![Home on a phone-width screen](./imgsrc/home/home-mobile.png) | ![Mobile navigation menu](./imgsrc/home/mobile-menu.png) |

### Profile

![Profile overview with completeness and import panel](./imgsrc/profile/overview.png)

![Core profile details](./imgsrc/profile/core-details.png)

![Context and skills fields with Explore, Enhance and Copy](./imgsrc/profile/context-skills.png)

![Experience entries](./imgsrc/profile/experience.png)

![Project entries](./imgsrc/profile/projects.png)

![Import text dialog](./imgsrc/profile/import-text-dialog.png)

![AI enhancement running on an experience](./imgsrc/profile/enhance-loading.png)

Earlier profile captures remain in the repo: [`profile.png`](./imgsrc/profile/profile.png), [`upload-resume.png`](./imgsrc/profile/upload-resume.png) and [`enhance.png`](./imgsrc/profile/enhance.png).

### Resume Lab

![Resume Lab overview](./imgsrc/resume/overview.png)

![Step 1: choosing skills, experiences and projects](./imgsrc/resume/what-to-include.png)

![Selected items](./imgsrc/resume/items-selected.png)

![Step 2: tailor to a job, with AI coaching switched off](./imgsrc/resume/tailor-to-job.png)

![Step 2: tailor to a job, with AI coaching switched on](./imgsrc/resume/tailor-enabled.png)

![Step 3: style and coaching](./imgsrc/resume/style-and-coaching.png)

![Manual AI coaching switched on, with styling and content options](./imgsrc/resume/manual-coaching.png)

![Styling preferences: font size, bold and italic, accent colour](./imgsrc/resume/manual-coaching-styling.png)

![Choosing up to three items to enhance](./imgsrc/resume/content-coach-select.png)

![Items picked for content coaching](./imgsrc/resume/content-coach-picked.png)

![Coaching questions in progress](./imgsrc/resume/coaching-styling-chat.png)

![Styling preferences filled in](./imgsrc/resume/coaching-styling-filled.png)

![Styling preferences saved](./imgsrc/resume/coaching-styling-saved.png)

![Content coaching panel after the content options are enabled](./imgsrc/resume/manual-coaching-content.png)

![Step 4: generate and preview](./imgsrc/resume/generate-preview.png)

![Full Resume Lab page, configured](./imgsrc/resume/full-configured.png)

Earlier captures: [`view.png`](./imgsrc/resume/view.png), [`style-coach.png`](./imgsrc/resume/style-coach.png), [`preview.png`](./imgsrc/resume/preview.png), [`on-hold.png`](./imgsrc/resume/on-hold.png) and [`done.png`](./imgsrc/resume/done.png). Sample PDFs in each template are in [`cv-assistant/public`](./cv-assistant/public/) (`style1.pdf` to `style5.pdf`).

### Cover Letter

![Cover letter module overview](./imgsrc/generate/overview.png)

![Job brief and evidence panel](./imgsrc/generate/evidence-open.png)

![AI coaching ranking evidence](./imgsrc/generate/ai-coaching-done.png)

![Generating the letter](./imgsrc/generate/generating.png)

![Clarification question: lead proof](./imgsrc/generate/clarifying-questions.png)

![Clarification question answered](./imgsrc/generate/clarifying-selected.png)

![Generated letter](./imgsrc/generate/result.png)

![Advanced Mode option](./imgsrc/generate/advanced-mode.png)

![Employer answer panel](./imgsrc/generate/employer-answer.png)

![Cover letter on a phone-width screen](./imgsrc/generate/mobile.png)

![Cover letter in dark theme](./imgsrc/generate/dark.png)

### Job Search

![Job Search overview](./imgsrc/search/overview.png)

### Auto Apply

![Auto Apply brief, matches, review and apply steps](./imgsrc/auto-apply/review-full.png)

![Review step: a role, its questions and the cover letter](./imgsrc/auto-apply/review-job.png)

![Matches step](./imgsrc/auto-apply/matches-step.png)

![Apply step](./imgsrc/auto-apply/apply-step.png)

### Control Room

![Control Room, full page](./imgsrc/control-room/full.png)

![Gap heatmap](./imgsrc/control-room/heatmap.png)

![Saved leads and the specialist workflow](./imgsrc/control-room/leads.png)

## Quick start

Requirements: Node.js 22 (recommended), npm, a MongoDB database and at least one NVIDIA NIM API key.

```bash
git clone https://github.com/Lelekhoa1812/CVA.git
cd CVA/cv-assistant
npm install
```

Create `cv-assistant/.env.local`:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
NVIDIA_NIM_API_KEY_1=your_nvidia_nim_api_key
```

Start the development server and open the app:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000), register an account and complete your profile on `/profile` before using the other modules.

The full list of variables, including the optional model cascade and base-path settings, is in [`cv-assistant/docs/configuration.md`](./cv-assistant/docs/configuration.md).

## Documentation

All detailed documentation lives in [`cv-assistant/docs/`](./cv-assistant/docs/).

| Topic | Document |
|---|---|
| System architecture, request lifecycle and module map | [`docs/architecture.md`](./cv-assistant/docs/architecture.md) |
| Data models and the MongoDB schema | [`docs/data-models.md`](./cv-assistant/docs/data-models.md) |
| HTTP API reference (every route) | [`docs/api-reference.md`](./cv-assistant/docs/api-reference.md) |
| AI layer: NVIDIA NIM tiers, key rotation, guards | [`docs/ai-layer.md`](./cv-assistant/docs/ai-layer.md) |
| Environment variables and configuration | [`docs/configuration.md`](./cv-assistant/docs/configuration.md) |
| Deployment, operations and troubleshooting | [`docs/deployment.md`](./cv-assistant/docs/deployment.md) |
| Testing, scripts and manual QA | [`docs/testing.md`](./cv-assistant/docs/testing.md) |
| Contributing and the codebase conventions | [`docs/contributing.md`](./cv-assistant/docs/contributing.md) |
| Profile | [`docs/features/profile.md`](./cv-assistant/docs/features/profile.md) |
| Resume Studio | [`docs/features/resume-studio.md`](./cv-assistant/docs/features/resume-studio.md) |
| Cover letter generation | [`docs/features/cover-letter-generate.md`](./cv-assistant/docs/features/cover-letter-generate.md) |
| Job Search | [`docs/features/job-search.md`](./cv-assistant/docs/features/job-search.md) |
| Auto Apply (user-facing) | [`docs/features/auto-apply.md`](./cv-assistant/docs/features/auto-apply.md) |
| Auto Apply engine (backend) | [`docs/features/auto-apply-engine.md`](./cv-assistant/docs/features/auto-apply-engine.md) |
| Control Room | [`docs/features/control-room.md`](./cv-assistant/docs/features/control-room.md) |
| Auto Apply quality metrics | [`docs/auto-apply-quality-metrics.md`](./cv-assistant/docs/auto-apply-quality-metrics.md) |
| Career evaluation pipeline (backward compatibility) | [`docs/career-evaluation-pipeline.md`](./cv-assistant/docs/career-evaluation-pipeline.md) |

## Scripts

Run these from `cv-assistant/`:

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run test:unit` | Career and Control Room unit tests |
| `npm run test:search` | Job search tests |
| `npm run test:ai` | AI layer tests |
| `npm run test:auto-apply` | Auto Apply unit tests |
| `npm run verify:career` | Lint, career tests and Auto Apply tests together |
| `npm run eval:letters` | Cover letter regression eval (needs a live NVIDIA NIM key) |

See [`docs/testing.md`](./cv-assistant/docs/testing.md) for what each suite covers and the optional live browser scripts.

## Deployment

The app is set up for Vercel (`cv-assistant/vercel.json`). Configure the environment variables in the Vercel project before the first deploy. Long-running routes such as auto-apply run after the response is sent and rely on the platform's function duration limits. Read [`docs/deployment.md`](./cv-assistant/docs/deployment.md) before you rely on it in production, in particular the notes on rate limiting, the dev-only browser preview and native modules.

## Contributing

1. Fork the repository and create a branch.
2. Read [`docs/contributing.md`](./cv-assistant/docs/contributing.md) for the conventions.
3. Run `npm run lint` and the relevant test suites before you open a pull request.
4. Open a pull request against `main`.

Report issues on [GitHub Issues](https://github.com/Lelekhoa1812/CVA/issues).

## Licence

This project is licensed under the Apache License 2.0. See [LICENSE.txt](./LICENSE.txt).

---

Built with Next.js, TypeScript and NVIDIA NIM.
