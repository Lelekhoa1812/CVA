# Career evaluation pipeline (backward compatibility)

## Motivation vs Logic

**Motivation:** Control Room persisted `JobEvaluation` documents before the LLM-first strategist. Reads and analytics must not break when those documents lack new fields.

**Logic:** Treat missing `analysisSource` / `analysisVersion` as legacy **heuristic** scoring. New orchestrations set `analysisSource: "llm"` (or `"fallback"` if the model failed and we used deterministic backup), `analysisVersion: 2`, and optional `model`. Gap entries may include `code` for stable heatmap aggregation; legacy gaps only had `title` / `severity` / `detail` / `mitigation`.

## Field map

| Field | Legacy | LLM-first (v2) |
|-------|--------|----------------|
| `analysisSource` | absent (treat as `heuristic`) | `llm` \| `fallback` |
| `analysisVersion` | absent (treat as `0`) | `2` |
| `model` | absent | resolved model id string |
| `jobUnderstanding` | absent | structured job extraction snapshot |
| `gapMap[].code` | absent | stable id, e.g. `work_mode_mismatch` |
| `matchedRequirements` | keyword rows from `topKeywords` | model-authored requirement lines + coverage |

## Heatmap policy

Gap heatmap aggregates by `gap.code` when present; otherwise falls back to a slug of `gap.title` for legacy rows. Evaluations with `analysisSource === "heuristic"` (or missing `analysisVersion` / version &lt; 2) are **excluded** from the heatmap so old token-noise rows do not mix with v2 themes. Re-run orchestration on leads to populate v2 evaluations.

## Migration (re-score)

1. **No automatic DB migration** — existing `JobEvaluation` documents keep their stored shape; missing fields are treated as legacy when read.
2. **Refresh v2 data** — run **Run Specialist Workflow** (or `POST /api/control-room/leads/:id/orchestrate`) on each lead you care about. New runs persist `analysisSource`, `analysisVersion: 2`, `jobUnderstanding`, and coded `gapMap` entries.
3. **Empty heatmap** — if every stored evaluation is pre-v2, the dashboard heatmap may be empty until at least one orchestration completes; the Control Room shows a short note in that case.
4. **Tests** — set `CONTROL_ROOM_STRATEGIST_MODE=heuristic` to force the overlap-based strategist without calling Azure (see `tests/career/run-tests.ts`).
