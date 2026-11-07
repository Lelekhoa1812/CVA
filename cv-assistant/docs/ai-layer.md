# AI layer

Derived from the source on 2026-11-07. Paths are relative to `cv-assistant/`. Model calls are made only from `src/lib/ai.ts`. Prompt builders and guards live in `src/lib/cover-letter.ts`, `src/lib/cover-letter-service.ts`, `src/lib/cover-letter-advanced.ts` and `src/lib/generate/`.

## Contents

1. Overview
2. Provider and request format
3. Public API of `src/lib/ai.ts`
4. Model tiers and default model ids
5. API key rotation
6. Failure handling: classification, cooldowns and fallback
7. Timeouts and budgets
8. Streaming
9. Retries by caller
10. Structured output (JSON)
11. Error reference
12. Which feature calls which tier
13. Prompt building and guards
14. Known inconsistencies
15. Tests and evaluation

## 1. Overview

- **One provider: NVIDIA NIM.** The code calls the OpenAI-compatible `chat/completions` endpoint of NVIDIA NIM. No other model provider is called. `package.json` declares no model SDK. The names `AZURE_AI_FOUNDRY_*` and `GEMINI_API` that appear in the local `.env` are not read by any code (see `docs/configuration.md`).
- **One client module.** Feature code never calls the network for models. Everything goes through `src/lib/ai.ts`.
- **Three entry points:**
  - `getModel(preset)` returns `{ generateContent(payload) }`. It resolves to the full text of one model response.
  - `generateJsonSafe(preset, prompt, maxRetries, signal)` sends a prompt and parses a JSON object out of the reply.
  - `getAutoApplySupervisorModel()` is the variant used by the Auto Apply browser guidance. It can pin one model.
- **Tiers ("presets"):** `easy`, `hard` and `document`. A separate vision list is used automatically when a request contains an image.
- **Streaming inside, text outside.** Requests are streamed from NIM and assembled into one string before the caller receives it. No model output is streamed to the browser.
- **Structured output is prompt-driven.** No provider JSON mode is requested. `generateJsonSafe` extracts the text between the first `{` and the last `}`.

| File | Role |
|---|---|
| `src/lib/ai.ts` | NIM client: key rotation, model cascades, streaming, timeouts, JSON helper |
| `src/instrumentation.ts` | Logs, at Node.js server start, how many NIM keys are configured |
| `src/lib/generate/claim-check.ts` | Model-based review of a draft for unsupported claims (non-blocking) |
| `src/lib/generate/clarifications.ts` | Prompt, normalisation and answer formatting for clarification questions |
| `src/lib/generate/validation.ts` | Length and shape limits for generation requests |
| `src/lib/cover-letter.ts` | Evidence items, contact lines, and the cover letter and employer answer prompts |
| `src/lib/cover-letter-service.ts` | Standard cover letter agent (`runCoverLetterAgent`) and its deterministic guards |
| `src/lib/cover-letter-advanced.ts` | Multi-step advanced agent: planner, retriever, auditor, synthesiser, reviewer, revision |

## 2. Provider and request format

**Endpoint.** `POST {NVIDIA_NIM_BASE_URL}/chat/completions`. The base URL defaults to `https://integrate.api.nvidia.com/v1`. Trailing slashes are removed.

**Headers.**

```http
Content-Type: application/json
Authorization: Bearer <one NIM key>
Accept: text/event-stream
```

**Body.** The body built in `requestModel()` contains exactly these fields:

```json
{
  "model": "<model id>",
  "messages": [{ "role": "user", "content": "<text>" }],
  "stream": true,
  "max_tokens": 32768
}
```

It never contains `response_format`, `tools`, `temperature`, `top_p` or any reasoning option.

**Message mapping** (`mapMessages`, `src/lib/ai.ts`):

- Roles: `assistant` and `model` map to `assistant`; `system` maps to `system`; anything else maps to `user`.
- Text-only messages: the parts are joined with a newline.
- Messages with `inlineData`: the content becomes an array. Parts whose MIME type starts with `image/` become `image_url` items with a base64 data URL. Any other MIME type throws `NVIDIA NIM does not accept <mime> as chat input`.
- Payload fields `previousResponseId`, `tools` or `extraInputItems` make `mapMessages` throw, because the Responses API state and tools are unsupported. No caller passes them. The `reasoning` field is declared in the type but never read.

## 3. Public API of `src/lib/ai.ts`

| Export | Signature (simplified) | Used by |
|---|---|---|
| `getModel` | `(preset) => { generateContent(payload) }` | Route handlers and modules that need raw text (section 12) |
| `getAutoApplySupervisorModel` | `() => { generateContent(payload) }` | `src/app/api/auto-apply/job/[jobId]/browser/start/route.ts` |
| `generateJsonSafe` | `(preset, prompt, maxRetries = 2, signal?) => Promise<unknown>` | Most feature modules (section 12) |
| `resolveModelName` | `(preset) => string`, the first id in the tier list | `tests/career/run-tests.ts` only |
| `resolveAutoApplySupervisorModelName` | `() => string` | `tests/career/run-tests.ts` only |
| `getNvidiaNimKeyCount` | `() => number` | Not imported anywhere. `src/instrumentation.ts` repeats the count itself |

`generateContent(payload)` resolves to `{ response: { text(): string; model: string } }`. The shape imitates the Gemini SDK surface, but no Gemini endpoint is called. The `ModelPreset` type is not exported, so callers pass the literal strings `'easy'`, `'hard'` or `'document'`.

Payload type (`GenerateContentPayload`):

- `contents`: an array of `{ role, parts }`, where each part is `{ text? }` or `{ inlineData?: { data, mimeType } }`.
- `modelOverride?`: one model id to try instead of the tier list.
- `signal?`: an `AbortSignal` for cancellation and per-call timeouts.
- `previousResponseId?`, `tools?`, `extraInputItems?`, `reasoning?`: declared, unused by callers, and rejected or ignored as described in section 2.

## 4. Model tiers and default model ids

### 4.1 Lists

Defaults are defined in `DEFAULT_MODELS` (`src/lib/ai.ts`, lines 54 to 58). The vision default is defined in `createResponse` (line 190).

| Tier | Environment override | Default list, in order |
|---|---|---|
| `easy` | `NVIDIA_NIM_EASY_MODELS` | `poolside/laguna-xs-2.1`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-ultra-550b-a55b` |
| `hard` | `NVIDIA_NIM_HARD_MODELS` | `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-ai/deepseek-v4.1-flash` |
| `document` | `NVIDIA_NIM_DOCUMENT_MODELS` | `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-ai/deepseek-v4.1-flash` |
| Vision (requests with images) | `NVIDIA_NIM_VISION_MODELS` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `stepfun-ai/step-5-preview` |
| Supervisor (Auto Apply guidance) | `NVIDIA_NIM_SUPERVISOR_MODEL` | Unset: the whole `hard` list. Set: that single model id |

Rules:

- An environment override replaces the default list. It is not merged. Entries are split on commas, trimmed and de-duplicated (`modelList`). The vision list is split and trimmed but not de-duplicated.
- The first id in a list is what `resolveModelName` returns.
- Model selection order in `createResponse`: `modelOverride` if present, then the vision list if the payload contains an image, then the tier list. A `modelOverride` wins even when the payload contains an image.
- Hard-coded lists outside `ai.ts`, which ignore the environment:
  - `COVER_LETTER_MODELS` = `nvidia/nemotron-3-ultra-550b-a55b`, `poolside/laguna-xs-2.1`, `deepseek-ai/deepseek-v4.1-flash` (`src/lib/cover-letter-service.ts`, line 17).
  - `GROUNDING_MODELS` = `nvidia/nemotron-3-ultra-550b-a55b`, `deepseek-ai/deepseek-v4.1-flash` (`src/lib/cover-letter-service.ts`, line 20).
  - These are passed one at a time as `modelOverride`, so the cascade is in `generateLetterText`, not in `createResponse`.

### 4.2 Per-model limits

`requestModel` applies a per-model `max_tokens` cap and a first-token timeout default.

| Model id | Per-model cap | First-token timeout default |
|---|---|---|
| `poolside/laguna-xs-2.1` | 16384 | 20 s |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | 65536 | 20 s |
| `stepfun-ai/step-5-preview` | 1048576 | 55 s |
| `deepseek-ai/deepseek-v4.1-flash` | 1048576 | 75 s |
| Any other id, including `nvidia/nemotron-3-ultra-550b-a55b` | 32768 | 20 s |

Effective `max_tokens` = the smaller of `NVIDIA_NIM_MAX_TOKENS` (default 65536) and the per-model cap. For the default `hard` and `document` first choice, `nvidia/nemotron-3-ultra-550b-a55b`, the effective ceiling is therefore 32768.

## 5. API key rotation

**Sources.** `NVIDIA_NIM_API_KEY_1` through `NVIDIA_NIM_API_KEY_9`. Nine slots are read; `NVIDIA_NIM_API_KEY_10` and above are ignored.

**Normalisation** (`availableKeys()`, `src/lib/ai.ts` lines 35 to 47):

1. Read the nine variables, trim them and drop empty values.
2. De-duplicate by value. Two slots holding the same key are one credential with one shared state.
3. Credential state (`KeyState`): `inFlight` (concurrent requests), `disabledUntil` and `lastUsed`. These live in the module-level `keyStates` map.
4. Model-and-credential state (`ModelKeyState`): `cooldownUntil` and `failures`, keyed by model id and key value, in the module-level `modelKeyStates` map.

The maps are per process. Each serverless instance and each Node process keeps its own state. The comment in `src/lib/ai.ts` (lines 21 to 22) states that a provider's rate limit remains the source of truth across instances.

**Selection** (`createResponse`, lines 185 to 236):

- Outer loop: up to as many rounds as there are keys.
- Inner loop: the models of the tier, in list order. In each round, each model gets at most one attempt.
- An attempt for a model uses an eligible key. A key is eligible when it has not yet been tried for that model in this call, is not disabled, and has no active cooldown for that model.
- Eligible keys are sorted by `inFlight` ascending, then by `lastUsed` ascending. `lastUsed` is a global sequence number, so the least recently used key goes first. New keys start at a negative random value, so their first use is random.
- Each model is tried with every eligible key before the call gives up. The comment in the source describes the intent: "Try each model before returning to a second key for the same model", so one slow or rate-limited model cannot consume the whole deadline.
- There is no sleeping. When no candidate is eligible the loop ends, and the last error is thrown.

Keys are never logged. `src/instrumentation.ts` logs only the count:

```text
NVIDIA NIM: 3 distinct API keys configured.
NVIDIA NIM: no API keys are configured; AI features will be unavailable.
```

## 6. Failure handling: classification, cooldowns and fallback

After a failed attempt, `createResponse` classifies the error by HTTP status. A status of `0` is used for transport failures and stream failures that have no HTTP status.

| Outcome | Scope | Action |
|---|---|---|
| 401 or 402 | Credential | Key disabled for `max(retry-after, 5 min)`. Applies to every model |
| 403, 404, 429, 500 and above, or status 0 | Model and credential | Cooldown for `retry-after` if the header is set. Otherwise `min(60 s, base x 2^min(failures, 4))`, where base is 10 s for 429 and 3 s otherwise. The failure counter increments. The next candidate is tried |
| Any other status, such as 400, 408, 413 or 422 | Model, this call only | Model removed from the rest of this call. No cooldown is recorded |
| Success | Model and credential | Cooldown cleared. Text returned |
| Caller `signal` aborted | Call | Throws `NVIDIA NIM request cancelled` at once. No other key or model is tried |
| Overall budget exceeded | Call | Throws `NVIDIA NIM request timed out` |

Status `0` covers: network failure; idle, first-token or total timeout; a malformed or incomplete stream; a `finish_reason` other than `stop` (for example `length`); and empty output.

Points to note:

- `retry-after` is not capped for the model-and-credential cooldown. For 401 and 402 the key stays disabled for at least five minutes even if the header is absent.
- A `finish_reason` of `length` means the output hit `max_tokens`. It is treated as a retryable failure, so the same prompt goes to another key or model.
- A caller-supplied signal that aborts ends the whole call. Example: the 40 second per-call timeout in `generateLetterText` (`src/lib/cover-letter-service.ts`, line 48). In that case the wrapper does not rotate to another key. The caller's own fallback then applies, which for `generateLetterText` means the next model.
- In-memory state is cleared when the process restarts.

## 7. Timeouts and budgets

### 7.1 Inside the NIM client (`src/lib/ai.ts`)

| Setting | Default | Applies to |
|---|---|---|
| `NVIDIA_NIM_TIMEOUT_S` | 240 s | Overall budget for one `createResponse` call, across every attempt. Checked before each attempt |
| `NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S` | 20 s (55 s for `stepfun-ai/step-5-preview`, 75 s for `deepseek-ai/deepseek-v4.1-flash`) | Maximum wait for the first body chunk of one attempt |
| `NVIDIA_NIM_IDLE_TIMEOUT_S` | 90 s | Maximum silence between body chunks after the first |
| Per-attempt total | Remaining overall budget | Hard stop for one attempt (`requestModel`, total timer) |

The idle timer is reset on every body chunk read, whatever the bytes are, so keep-alive data also resets it.

### 7.2 Caller-level timeouts (hard-coded)

| Where | Limit | Purpose |
|---|---|---|
| `generateLetterText` (`src/lib/cover-letter-service.ts`, line 34) | 40 s per model call | One slow model cannot hold a batch |
| Grounding editor (`GROUNDING_CALL_TIMEOUT_MS`, line 21) | 40 s | Grounding call |
| Evidence ranking in `selectEvidenceForJob` (line 84) | 20 s | Ranking call; falls back to keyword overlap |
| `checkDraftClaims` (`CHECK_TIMEOUT_MS`, `src/lib/generate/claim-check.ts`, line 4) | 18 s | Claim review |
| `/api/generate/clarifications` (line 27) | 50 s | Decision step before drafting |
| `/api/generate/cover-letter` (line 51) and `/api/generate/employer-question` (line 50) | 240 s | Request budget, combined with the client's abort |
| `/api/auto-apply/job/[jobId]/cover-letter` | 250 s | Request budget |
| `runCoverLetterAgent`, `advancedBudgetMs` default | 150 s | Advanced agent; falls back to standard on timeout |
| `runCoverLetterAgent`, internal gates | Elapsed-time checks at 50 s, 35 s, 85 s and 100 s | Decide whether each refinement step starts (section 13.6) |
| Browser guidance (`GUIDANCE_TIMEOUT_MS`, `browser/start/route.ts`, line 11) | 60 s | Supervisor guidance call |

## 8. Streaming

- Every request is sent with `stream: true`. `readStream()` (`src/lib/ai.ts`, lines 107 to 146) parses server-sent events.
- Events are separated by blank lines (CRLF is tolerated). `data:` lines are joined. The `[DONE]` sentinel ends the stream. Each JSON chunk contributes `choices[0].delta.content`. `choices[0].finish_reason` is recorded.
- A chunk containing `error` throws `NVIDIA NIM reported a streaming error`. Invalid JSON throws `NVIDIA NIM returned malformed streaming data`.
- Completion rules: the stream must contain `[DONE]` or a `finish_reason`. A `finish_reason` other than `stop` is an error. Empty text is an error. The result is trimmed.
- The response is returned to the caller only after the stream ends. No partial output is forwarded.
- Of the HTTP routes, only `src/app/api/search/jobs/stream/route.ts` streams to the browser. That stream is the route's own server-sent output, not model output.

## 9. Retries by caller

| Caller | Mechanism | Attempts |
|---|---|---|
| `generateJsonSafe(preset, prompt, maxRetries = 2)` | Repeats the same prompt after any non-abort error, including a parse failure | `maxRetries + 1`; the last error is thrown |
| `/api/generate/cover-letter` (standard path) | `hard`, then 500 ms wait, then `hard`, then `easy` | 3 model calls; `fallback: 'easy'` is returned if the last one is used |
| `/api/generate/employer-question` (standard path) | Same sequence as above | 3 model calls |
| `textAgent` in `src/lib/cover-letter-advanced.ts` (line 238) | Primary tier, primary again after 500 ms, then `easy` | 3 model calls |
| `jsonAgent` in `src/lib/cover-letter-advanced.ts` (line 229) | `generateJsonSafe(primary, prompt, 1)`; returns a fallback value instead of throwing | 2 attempts |
| `runProfileImport` in `src/lib/profile-import.ts` (line 110) | Three attempts with the full parts each time | 3 |
| `/api/generate/clarifications` | `generateJsonSafe('easy', prompt, 1)`; if fewer than 2 usable questions, one more call with `maxRetries = 0` and a corrective note | Up to 3 |
| `checkDraftClaims` | `generateJsonSafe('easy', prompt, 0, signal)` | 1 |
| `runCoverLetterAgent` | Its own loops and gates (section 13.6) | Several |

## 10. Structured output (JSON)

### 10.1 `generateJsonSafe`

1. Sends the prompt as one user message. No system message and no JSON mode.
2. Takes `text.indexOf('{')` and `text.lastIndexOf('}')` and parses the slice. If there are no braces, the whole text is parsed.
3. A failed parse is handled like any other error and triggers a retry.

Consequences:

- Text containing braces outside the JSON object, such as explanations or reasoning, can break parsing.
- Top-level arrays are not supported. The slice starts at the first `{`, so `[{...},{...}]` does not parse as an array.
- The prompt is re-sent unchanged on retry. Retries do not add the error to the prompt. The clarification route is the exception: its second call adds a corrective note, and it is a separate call with `maxRetries = 0`.

`profile-import.ts` (`extractJsonPayload`, line 59) uses the same slicing.

### 10.2 Prompt contracts

Prompts state an exact JSON shape and say "Return only JSON". Examples:

- Experience ranking: `{"rankings":[{"index":0,"title":"...","justification":"..."}]}` (`src/lib/cover-letter.ts`, `buildExperienceRankingPrompt`).
- Claim check: `{"supported":true,"issues":[]}` (`src/lib/generate/claim-check.ts`).
- Clarifications: `{"questions":[{"decision":"...","prompt":"...?","why":"...","type":"single","options":[{"label":"...","detail":"..."}]}]}` (`src/lib/generate/clarifications.ts`).
- Verifier: `{"issues":[{"sentence":"...","reason":"..."}]}` (`src/lib/cover-letter-service.ts`).

### 10.3 Normalisers and validators

Parsed output is treated as untrusted:

- `normalizeClarificationQuestions`: keeps 2 to 5 questions, each with 2 to 5 options. Removes filler options such as "Other", "Not sure" and "No preference". Assigns stable ids `q1...` and `o1...`. Applies length caps.
- `normalizeCoveragePlan`, `normalizeSupplementalPlan`, `normalizeSynthesisPlan` and `normalizeReviewPlan` in `src/lib/cover-letter-advanced.ts`.
- `checkDraftClaims` requires `supported` to be a boolean and `issues` to be an array; otherwise it returns the "could not complete" warning.
- `selectEvidenceForJob` requires at least two valid evidence indices; otherwise it uses keyword ranking.
- Some features also validate with Zod, for example `src/lib/auto-apply/profile-draft.ts` and `src/lib/career/career-strategist.ts`.

## 11. Error reference

Errors that reach callers. Messages are exact.

| Message | Thrown by | Meaning and what to check |
|---|---|---|
| `No NVIDIA NIM API keys configured (NVIDIA_NIM_API_KEY_1 through NVIDIA_NIM_API_KEY_9)` | `createResponse` | No usable key in the nine slots |
| `NVIDIA NIM chat completions requires conversation messages; Responses API state and tools are unsupported` | `mapMessages` | A caller passed `previousResponseId`, `tools` or `extraInputItems` |
| `NVIDIA NIM does not accept <mime> as chat input` | `mapMessages` | Non-image `inlineData` |
| `NVIDIA NIM request failed (HTTP <status>)` | `requestModel` | Non-OK HTTP status (wrapped as a classified error, section 6) |
| `NVIDIA NIM request timed out or disconnected` | `requestModel` | Idle, first-token or total timeout, or a dropped connection |
| `NVIDIA NIM network request failed` | `requestModel` | Network error from `fetch` |
| `NVIDIA NIM returned no streaming response` | `readStream` | Response has no body |
| `NVIDIA NIM returned malformed streaming data` | `readStream` | A stream event is not valid JSON |
| `NVIDIA NIM reported a streaming error` | `readStream` | A chunk contains `error` |
| `NVIDIA NIM stream ended before completion` | `readStream` | No `[DONE]` and no `finish_reason` |
| `NVIDIA NIM response did not finish normally (<reason>)` | `readStream` | `finish_reason` other than `stop`, for example `length` |
| `NVIDIA NIM returned an empty response` | `readStream` | No text after trimming |
| `NVIDIA NIM request cancelled` | `createResponse` | Caller signal aborted, including caller-level timeouts |
| `NVIDIA NIM request timed out` | `createResponse` | Overall `NVIDIA_NIM_TIMEOUT_S` budget exhausted |
| `All configured NVIDIA NIM keys are temporarily unavailable for the selected models` | `createResponse` | Every candidate was cooling down or disabled and no earlier error exists |
| `Failed to parse profile import JSON: <error>` | `runProfileImport` | Three attempts failed; the inner error text is appended |
| `No model produced a cover letter` | `generateLetterText` | Every model in the list failed or produced no text |

How these surface to clients:

| Caller | Surface |
|---|---|
| `/api/generate/cover-letter` and `/api/generate/employer-question` | `502` with `Cover letter generation temporarily unavailable. Please try again.` or `Employer question answer generation temporarily unavailable. Please try again.`; `504` `Generation timed out. Please try again.` when the request budget ran out |
| `/api/generate/clarifications` | `200` with `{ "questions": [], "unavailable": true }`. Not an error status |
| `runCoverLetterAgent` in Auto Apply | Caught in `src/lib/auto-apply/prepare.ts`; the job gets the warning `Cover letter generation failed: <message>.` |
| Browser guidance | `guidance` becomes `Browser preview is live. Guidance model unavailable: <message>` |

## 12. Which feature calls which tier

Derived with `grep` for `getModel(`, `generateJsonSafe(` and `getAutoApplySupervisorModel(`, then checked by reading each call site. "Retries" lists the explicit third argument of `generateJsonSafe`. A call with no third argument uses the default of 2.

| Feature | Entry point (file and line) | Tier or model source | Retries and fallback |
|---|---|---|---|
| Resume summary | `src/app/api/resume/summarize/route.ts:14` | `getModel('easy')` | None at route level |
| Resume style parser | `src/app/api/resume/style-parser/route.ts:14` | `getModel('easy')` | None at route level |
| Resume quick enhance | `src/app/api/resume/enhance/route.ts:14` | `getModel('easy')` | None at route level |
| Resume coach | `src/app/api/resume/coach/route.ts:43` | `getModel('hard')` | None at route level |
| Targeted resume enhance | `src/app/api/resume/enhance-targeted/route.ts:17` | `getModel('hard')` | None at route level |
| Resume beautify | `src/app/api/resume/beautify/route.ts:14` | `getModel('hard')` | None at route level |
| Bullet and section rewrite | `src/app/api/enhance/route.ts:35` | `getModel('hard')` | None at route level |
| Profile text summary | `src/app/api/profile/route.ts:242` | `getModel('easy')` | None |
| Profile import from PDF, DOCX or text | `src/lib/profile-import.ts:111`, reached from `src/app/api/ocr/route.ts` | `getModel('document')`. Pages that are images or have little text go through the vision list | 3 attempts |
| Cover letter, standard | `src/app/api/generate/cover-letter/route.ts:19` to `:45` | `hard`, `hard` after 500 ms, `easy` | Section 9 |
| Cover letter, advanced | `generateAdvancedCoverLetter`, `src/lib/cover-letter-advanced.ts:717`, called from `src/app/api/generate/cover-letter/route.ts:81` | Primary `hard` (no preset passed) | Text steps: `hard`, `hard`, `easy` |
| Employer question, standard | `src/app/api/generate/employer-question/route.ts:18` to `:44` | `hard`, `hard`, `easy` | Section 9 |
| Employer question, advanced | `generateAdvancedEmployerAnswer`, `src/lib/cover-letter-advanced.ts:796` | Always `hard` as primary (no preset parameter) | Text steps: `hard`, `hard`, `easy` |
| Clarification questions | `src/app/api/generate/clarifications/route.ts:33` and `:35` | `generateJsonSafe('easy', ..., 1)` | Second call with 0 retries when fewer than 2 usable questions |
| Experience ranking | `src/app/api/generate/select/route.ts:30` | `generateJsonSafe('hard', ..., 1)` | 1 retry |
| Claim check | `src/lib/generate/claim-check.ts:31` | `generateJsonSafe('easy', ..., 0)` | 0 retries, 18 s |
| Cover letter agent (Auto Apply and eval harness) | `runCoverLetterAgent`, `src/lib/cover-letter-service.ts:273` | `generateLetterText` with `COVER_LETTER_MODELS` for drafts and `GROUNDING_MODELS` for grounding. Verifier `generateJsonSafe('hard', ..., 0)` at line 397 | Section 13.6 |
| Evidence ranking inside the agent | `src/lib/cover-letter-service.ts:85` | `generateJsonSafe('easy', ..., 0)` | 0 retries, 20 s |
| Application answers (Auto Apply) | `src/lib/auto-apply/prepare.ts:167` | `generateJsonSafe('easy', ..., 1)` | 1 retry |
| Job fit scoring (Auto Apply) | `src/lib/auto-apply/fit.ts:70` | `generateJsonSafe('easy', ..., 1)` | 1 retry |
| Profile draft (Auto Apply) | `src/lib/auto-apply/profile-draft.ts:295` | `generateJsonSafe('easy')` | Default 2 retries |
| Browser guidance (dev preview) | `src/app/api/auto-apply/job/[jobId]/browser/start/route.ts:67` | `getAutoApplySupervisorModel()`. With a screenshot, the vision list is used instead | None |
| Search intent | `src/lib/search/server/intent.ts:68`, `:117`, `:186` | `generateJsonSafe('easy', ..., 1)` | 1 retry each |
| Control Room support | `src/lib/career/control-room.ts:129`, `:239` | `generateJsonSafe('easy', ..., 1)` | 1 retry each |
| Job understanding (market analyst) | `src/lib/career/job-understanding.ts:107`, called from `src/lib/career/market-analyst.ts:107` | `generateJsonSafe('easy', ..., 1)` | 1 retry |
| Career strategist (LLM fit scoring) | `src/lib/career/career-strategist.ts:188` | `generateJsonSafe('hard', ..., 2)`. Skipped when `CONTROL_ROOM_STRATEGIST_MODE=heuristic` | 2 retries. Heuristic scoring on error or when the job description is under 40 characters |
| Resume AI coaching | `src/lib/resume/ai-coaching.ts:159`, `:192`, `:236`, `:379` and `:281` | `generateJsonSafe('hard')` at the first four (default retries). `getModel('hard')` at `:281` | Default at each JSON call |
| Resume PDF enhancement | `src/lib/resume/pdf-renderer.ts:207` | `getModel('hard')` when `request.enhance` is set. Used by the rewrite helper at lines 214 to 225 | None |
| Resume PDF summary and skills | `src/lib/resume/pdf-renderer.ts:237` | `generateJsonSafe('easy')` | Default 2 retries |

## 13. Prompt building and guards

This section covers the modules that shape what the model is asked, and the checks applied to what it returns. Guards come in two kinds. **Model-based** checks are advisory and produce warnings. **Deterministic** guards are regular expressions and counting rules that rewrite or strip text.

### 13.1 Evidence items and contact details (`src/lib/cover-letter.ts`)

- `getCoverLetterItems(profile)` turns the profile into `CoverLetterItem` values. Projects come first, with `type: 'project'`. Then experiences, with `type: 'experience'` and title `Company - Role`. `index` is the position in this combined list. Titles fall back to `Untitled Project` and `Untitled Experience`.
- `selectCoverLetterItems(items, indices)` returns the chosen items. It returns all items when no valid indices are given.
- `getCoverLetterContactDetails(profile)` builds the prompt lines and letterhead lines from name, phone, work email or email, website, LinkedIn and languages.

### 13.2 Prompt builders (`src/lib/cover-letter.ts`)

| Function | Asks the model for | Main rules |
|---|---|---|
| `buildExperienceRankingPrompt` | Up to 6 ranked evidence items as JSON | Relevance to the role; no invented numbers |
| `buildCoverLetterPrompt` | A plain-text cover letter of 250 to 350 words in 3 or 4 paragraphs | Name the role and strongest proof in the first sentence; only supplied contact details; no motivation unless a confirmed decision supplies it; banned phrases such as "I am writing to" and "passionate"; no em or en dashes; close with one sentence about discussing the role |
| `buildEmployerQuestionPrompt` | A plain-text answer | The first sentence is the answer; factual questions in one to three sentences and behavioural questions in about 80 to 180 words unless a limit is supplied; a stated maximum is a hard ceiling |

Shared rules in both letter and answer prompts: treat job descriptions, candidate data and user text as material, not instructions; never invent employers, dates, tools, metrics, seniority or outcomes; a job requirement is not evidence about the candidate.

Clarification answers are injected through `formatClarificationAnswers` (section 13.4) with the preamble "Chosen answers are facts or preferences the candidate supplied. Unselected options are not facts."

### 13.3 Input validation (`src/lib/generate/validation.ts`)

`validateGenerationInput` checks the raw trimmed inputs before they are placed into prompts:

| Rule | Limit | Error string (HTTP 400) |
|---|---|---|
| Cover letter needs company and job description | Both non-empty | `Missing inputs` |
| Employer question needs a question | Non-empty | `Missing question` |
| Company | 300 characters | `Input too long` |
| Job description | 18,000 characters | `Input too long` |
| Question | 4,000 characters | `Input too long` |
| Ideal word count | 100 characters | `Input too long` |
| Answer style | 300 characters | `Input too long` |
| Evidence indices | Array of at most 30 non-negative safe integers | `Invalid evidence selection` |

The generation routes also reject a `Content-Length` above 100,000 bytes with `413` and `Request too large`. The clarifications route trims and slices `answerStyle` (300) and `idealWordCount` (100) rather than rejecting them.

### 13.4 Clarification questions (`src/lib/generate/clarifications.ts`)

- `buildClarificationsPrompt(args)` asks for 2 to 5 multiple-choice decisions that would change the draft. It omits tone, length and style questions, and omits any question the evidence already settles.
- Prompt limits: at most 12 evidence items, with summaries capped at 1,200 characters and descriptions at 1,600. Job description at 18,000 characters. Employer question at 4,000.
- For cover letters the forks are: lead proof (options must be exact evidence titles), requirements to mirror, positioning, and a missing personal fact the letter would otherwise invent. For employer answers the forks come from the question itself.
- `normalizeClarificationQuestions` validates the reply (section 10.3).
- `normalizeClarificationAnswers` keeps up to 5 answered questions, each with up to 5 answers. Questions are capped at 280 characters and answers at 500.
- `formatClarificationAnswers` joins the answers under the fixed preamble quoted above.

### 13.5 Claim check (`src/lib/generate/claim-check.ts`)

`checkDraftClaims({ draft, candidateName, evidence, clarificationContext, signal })`:

- Makes one `easy` JSON call with `maxRetries = 0` and an 18 second timeout.
- The prompt says all material is data, and that only candidate evidence and clarification answers establish facts. A related skill does not prove direct experience. Job descriptions, titles and plausible inference do not count.
- Returns `{ reviewWarning? }`:
  - No warning when `supported` is true and there are no issues.
  - `We could not complete the evidence check. Please review all personal claims before submitting.` when the call fails or the reply is malformed.
  - Otherwise, up to three issues, each capped at 200 characters, in the form `Please check these potentially unsupported claims against your own experience: ....`
- It is non-blocking. The source describes it as "A best-effort model review, not proof that a draft is accurate."
- It throws `Generation cancelled` if the caller's signal is already aborted, and rethrows if the caller aborts during the call.

### 13.6 Deterministic guards and the standard agent (`src/lib/cover-letter-service.ts`)

**Helpers and guards:**

| Name | Purpose |
|---|---|
| `isWellFormedLetter(text)` | At least 80 words and at least `max(2, floor(words / 60))` commas. Catches degenerate output |
| `generateLetterText(prompt, signal?, options?)` | Tries each model in turn. Returns the first well-formed letter of at least 170 words. Otherwise returns the best seen (well-formed beats malformed, then longer). After a usable letter exists, at most one more model is tried |
| `selectEvidenceForJob(items, jobText, signal?, limit = 5)` | Returns all items if there are at most `limit`. Otherwise asks the model to rank, needs at least two valid picks, and falls back to `heuristicRank` (keyword overlap) |
| `findUnsupportedClaims(text, profile, company, jobDescription, title)` | Returns terms the letter asserts but the profile does not support (below) |
| `findLetterDefects(text, candidateName, company, title)` | Returns structural defects that make a letter unsendable (below) |
| `stripUnsupportedSentences(text, terms, company)` | Removes sentences that contain the terms. Returns `null` if fewer than 120 words remain, and the caller then keeps the original text |
| `repairLetterStructure(text, candidateName, company, title)` | Deterministic repairs (below) |

**`findUnsupportedClaims` categories:**

- `employment at <company>` when a sentence says "at <company>, I developed..." and the profile does not mention the company.
- `claims a history with the employer: ...` for phrases such as "your recent", "co-developed your" and "powering X's".
- `echo: <seven-word run>` for seven consecutive words copied from the job description that the profile does not contain.
- `project as employer: <name>` when a profile project is written as "at <project>".
- Figures such as percentages, "k", "x", "million", "billion", durations, "sub-second" and "thousands" that the profile JSON does not contain.
- `N years` phrases that the profile JSON does not contain.
- Terms from `CLAIM_LEXICON` (line 103): technologies, certifications and degree names such as Kubernetes, Databricks, PhD, PMP and CISSP that appear in the letter but not in the profile.

**`findLetterDefects` checks:**

- Too short (under 170 words), reported as `too short`. Also too long: over 400 words. **The message says "keep it under 350 words", so the message and the threshold differ.**
- A single block of text, a broken sentence fragment, job-requirement phrasing ("meeting the ... requirement"), a garbled title run-on, a chat-style closer, and a bare title sentence.
- The word `candidate` used about the applicant, a missing greeting, an opening of "In this role", a truncated link, a missing sign-off, and a company or role that is not named.
- A letter that fails `isWellFormedLetter` (under 80 words, or too few commas for its length) is reported as missing punctuation.

**`repairLetterStructure` rewrites:**

- Removes "My CV shows that I" and similar phrases.
- Adds `Dear Hiring Manager,` when no greeting is present, and splits a greeting run into the first sentence.
- Inserts `I am applying for the <title> role at <company>.` when the opening does not name both.
- Moves a name run onto the last sentence into a `Sincerely,` sign-off.
- Removes chat-style closers and collapses repeated closing paragraphs.
- Moves contact details out of body paragraphs.
- Adds a closing sentence before the sign-off when none is present.
- Appends `Sincerely,` and the name when the last lines do not contain the name.

**`runCoverLetterAgent` pipeline** (`src/lib/cover-letter-service.ts`, lines 273 to 447). Steps in code order:

1. **Evidence selection.** `selectEvidenceForJob` over the profile items, using a job text of title, company and the first 6,000 characters of the description.
2. **Advanced branch (optional).** When `advanced` is set, runs `generateAdvancedCoverLetter` with `preset: 'easy'` and a budget of `advancedBudgetMs` (default 150 s). On failure the standard path runs and `fallbackNote` is set to `The advanced agent ran out of time, so the standard cover letter agent wrote this letter.`
3. **Standard draft.** `buildCoverLetterPrompt`, then `generateLetterText` with `COVER_LETTER_MODELS`.
4. **Claim and defect repair loop.** Up to two rounds, only while less than 50 s have elapsed and issues remain. The retry prompt lists the unsupported items and defects. A retry is kept only when it has fewer issues than the current text.
5. **Grounding editor.** `generateLetterText` with `GROUNDING_MODELS` and a 40 s call timeout. Round 0 runs whenever less than 50 s have elapsed. Round 1 runs only when issues remain and less than 35 s have elapsed. A result is accepted only if it is well-formed, between 170 and 400 words, and has no more issues than before.
6. **Strip.** If unsupported terms remain, `stripUnsupportedSentences` removes the offending sentences. A snapshot of the last text that met the length gate is kept.
7. **Independent verifier.** `generateJsonSafe('hard', ..., 0)` lists sentences to remove. Runs only when less than 85 s have elapsed. Pruned text is kept only if it stays at 170 words or more and well-formed.
8. **Expansion.** If still under 170 words and less than 100 s have elapsed, `generateLetterText` is asked for 220 to 300 words. Accepted only if well-formed, longer, at most 380 words, and free of unsupported claims.
9. **Restore.** If still short, the snapshot from step 6 is restored.
10. **Repair.** `repairLetterStructure`, then removal of a trailing link fragment.
11. **Results.** `reviewWarning` combines `Check these before sending, they are not in your profile: ...` (from remaining unsupported terms) with the model review from `checkDraftClaims`. `unsupportedClaims` lists remaining terms, leftover defects other than `too short`, and any concrete model finding.

Callers of `runCoverLetterAgent`:

- `src/app/api/auto-apply/job/[jobId]/cover-letter/route.ts` (the `advanced` flag comes from the request body; 250 s signal).
- `src/lib/auto-apply/prepare.ts` (standard mode).
- `evals/run-letter.ts` (the evaluation harness).

**The `/generate` studio does not use this pipeline.** `src/app/api/generate/cover-letter/route.ts` and `src/app/api/generate/employer-question/route.ts` run their own path: `buildCoverLetterPrompt` or `buildEmployerQuestionPrompt`, then `generateWithFallback`, then `checkDraftClaims`. In advanced mode they call `generateAdvancedCoverLetter` or `generateAdvancedEmployerAnswer`. The deterministic guards in this subsection (`findUnsupportedClaims`, `findLetterDefects`, `repairLetterStructure`) do not run on those routes.

### 13.7 Advanced agent (`src/lib/cover-letter-advanced.ts`)

The advanced agent is a chain of JSON and text calls. Each JSON step is wrapped by `jsonAgent`, which returns a fallback value instead of throwing unless the caller aborted.

1. **Planner** (`buildCoveragePlannerPrompt`, planner mode): audits job requirements against the initially selected evidence and marks each as covered or a gap.
2. **Retriever, round 1:** runs only if a requirement that is not `preferred` is uncovered. Proposes supplemental evidence (`buildSupplementalEvidencePrompt`).
3. **Auditor** (auditor mode): re-checks coverage after `buildFinalItems`. The final set is the initial items plus supplemental items, de-duplicated, experiences first, and capped at 8.
4. **Retriever, round 2:** runs only if a critical requirement is still uncovered. The supplemental list is capped at 6.
5. **Synthesiser** (`buildSynthesisPrompt`): positioning statement, evidence strategy, transferable signals and caution notes.
6. **Draft** (`textAgent`): `buildAdvancedCoverLetterPrompt` or `buildAdvancedEmployerAnswerPrompt`.
7. **Reviewer** (`buildReviewerPrompt`): returns `approved`, `score`, `issues` and `missingRoleSignals`. Its fallback value is `{ approved: true, score: 85 }`, which still triggers a revision because the threshold is 88.
8. **Revision** (`buildRevisionPrompt`, `textAgent`): run when the reviewer did not approve, scored below 88, or listed issues.

`sanitizeOutput` replaces em and en dashes with commas in every text step. The result carries `selectedIndices` and an `AdvancedGenerationTrace` with `coverageSummary`, `reviewerNotes`, `agentSteps` and related fields.

`generateAdvancedCoverLetter` (line 717) wraps its work in `presetStore.run(args.preset ?? 'hard', ...)`, an `AsyncLocalStorage` so that the primary tier reaches every nested call. `generateAdvancedEmployerAnswer` (line 796) does not use `presetStore`, so its primary tier is always `hard`.

## 14. Known inconsistencies

These were found while deriving this document. None is fixed here.

1. **Shared-agent claim.** The docblock above `generateLetterText` in `src/lib/cover-letter-service.ts` says the `/generate` studio and Auto Apply use one agent. Only Auto Apply and the eval harness call `runCoverLetterAgent` (section 13.6).
2. **Word-count threshold.** The defect message reads `too long: keep it under 350 words, one letter only`. The check fires above 400 words.
3. **Word-count targets differ by stage.** Prompts ask for 250 to 350 words (`buildCoverLetterPrompt`), 220 to 320 (grounding editor), and 220 to 300 (expansion). Acceptance accepts 170 to 400 (grounding and defects) and up to 380 (expansion).
4. **Employer answer tier.** `generateAdvancedEmployerAnswer` always starts at `hard`. The cover letter path called from Auto Apply starts at `easy`.
5. **Fallback note wording.** `fallbackNote` always says the advanced agent "ran out of time", even when it failed for another reason.
6. **Missing constant.** `src/lib/career/control-room.ts`, line 143, refers to `DEFAULT_EASY_MODEL`, which does not exist in the codebase.
7. **Supervisor helper.** `resolveAutoApplySupervisorModelName()` returns one model. Production (`getAutoApplySupervisorModel`) falls back to the whole `hard` cascade when `NVIDIA_NIM_SUPERVISOR_MODEL` is unset. Only the tests call the helper.
8. **Dead export.** `getNvidiaNimKeyCount` is exported but not imported. The instrumentation hook repeats the logic.
9. **Environment name in the eval.** `evals/promptfooconfig.yaml` says the suite "needs NVIDIA_API_KEY in .env". The code reads `NVIDIA_NIM_API_KEY_1` to `NVIDIA_NIM_API_KEY_9`.
10. **Cover letter model list ignores the environment.** `COVER_LETTER_MODELS` and `GROUNDING_MODELS` are constants. `NVIDIA_NIM_EASY_MODELS` does not affect them, even though `generateLetterText` requests the `easy` preset.
11. **Unused payload fields.** `reasoning`, `previousResponseId`, `tools` and `extraInputItems` are declared, but no caller sets them. The `mapMessages` guard for them is therefore defensive only.

## 15. Tests and evaluation

| Command | Target | What it covers |
|---|---|---|
| `npm run test:ai` | `tests/ai/run-tests.ts` | Replaces `globalThis.fetch` with scripted streams. Covers UTF-8 and CRLF stream parsing, key rotation on 429, model cascade, the first-token timeout (`NVIDIA_NIM_FIRST_TOKEN_TIMEOUT_S`), the missing-key error and the JSON helper |
| `npm run test:unit` | `tests/career/run-tests.ts` | Career modules, including the `NVIDIA_NIM_*_MODELS` overrides, `CONTROL_ROOM_STRATEGIST_MODE` and browser-enablement checks |
| `npm run test:auto-apply` | `tests/auto-apply/run-tests.ts` | Guards and repairs: `findUnsupportedClaims`, `findLetterDefects`, `repairLetterStructure`, `stripUnsupportedSentences`, `isWellFormedLetter` |
| `npm run eval:letters` | `evals/promptfooconfig.yaml` with `evals/provider.js` and `evals/run-letter.ts` | Runs `runCoverLetterAgent` against a fixture profile with real NIM calls. Asserts 170 to 400 words, no unsupported claims, no defects, first-person voice and no use of "candidate" |

`tests/generate/*.ts` (claim check, cancellation, clarifications, validation and prompt tests) is not referenced by any npm script. Run those files directly if needed. The `tests/generate` files use `node:assert`, and none imports `node:test`.

`evals/run-letter.ts` loads `.env` and `.env.local` itself. See `docs/configuration.md`.
