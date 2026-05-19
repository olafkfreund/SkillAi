// Re-export barrel — preserves the `@/actions/role-submissions` import path
// after the file was split into responsibility-grouped sub-modules.
//
// Each sub-file carries its own `'use server'` directive where required
// (mutations / sharing / public / reads). Types live in `shared.ts`.

export type {
  ActionResult,
  SubmissionWithDetails,
  CustomerVisibleSubmission,
  SubmissionForDashboard,
} from './shared'

export {
  submitCandidatesToCustomer,
  updateSubmissionStatus,
  removeSubmission,
} from './mutations'

export {
  generateShareToken,
  revokeShareToken,
} from './sharing'

export {
  updateSubmissionStatusByToken,
  getSubmissionByToken,
} from './public'

export {
  getSubmissionsForRole,
  getRecentSubmissionsForTenant,
  getAllSubmissionsForTenant,
} from './reads'
