// Root Cause vs Logic:
// Root cause: the resume-selection cap drifted because some PDF routes hard-coded `7`, while other flows already
// read from shared constants, creating mismatched validation between UI and server paths.
// Logic: keep the cap in one exported constant and have every selection-aware route import it so increasing the
// allowed projects/experiences to `20` stays synchronized across preview, generation, and AI coaching.
export const MAX_RESUME_ITEMS = 20;
export const MIN_JOB_DESCRIPTION_WORDS = 20;
