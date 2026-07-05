// Root Cause vs Logic:
// Root cause: resume selection, AI coaching, and PDF rendering need different budgets. A broad evidence pool can be
// larger than the final two-page resume, but the renderer must still enforce a strict page ceiling and add backfill
// only when there is useful space.
// Logic: keep MAX_RESUME_ITEMS as the candidate evidence pool and expose explicit page/fill constants for render-time
// pruning, compacting, and experience-first backfill.
export const MAX_RESUME_ITEMS = 20;
export const MIN_JOB_DESCRIPTION_WORDS = 20;
export const MAX_RESUME_PAGES = 2;
export const TARGET_MIN_PAGE_FILL_RATIO = 0.62;
export const DEFAULT_FINAL_EXPERIENCE_BUDGET = 6;
export const DEFAULT_FINAL_PROJECT_BUDGET = 4;
