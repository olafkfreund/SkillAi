// Re-export barrel — preserves the `@/actions/enrichment` import path
// after the file was split into responsibility-grouped sub-modules.
//
// Server-action exports live in their respective `'use server'` sub-files;
// internal helpers (http / search / platforms / matcher) are plain modules
// imported by the action files and are intentionally NOT re-exported.

export type { EnrichmentResult } from './orchestrate'

export { enrichCandidate } from './orchestrate'
export { confirmProfile, dismissProfile } from './verdicts'
export { updateCandidateLinks } from './links'
