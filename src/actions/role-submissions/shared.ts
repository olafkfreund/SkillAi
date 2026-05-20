import { z } from 'zod'
import type { SubmissionStatus } from '@/db/schema/role-submissions'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true; data: T })
  | { success: false; error: string }

export type SubmissionWithDetails = {
  id: string
  roleId: string
  /**
   * Role title — populated by the tenant-wide loader
   * (`getAllSubmissionsForTenant`) which JOINs `roles`. The per-role loader
   * (`getSubmissionsForRole`) leaves this `null` because the caller already
   * knows the role title from the page context.
   */
  roleTitle: string | null
  /**
   * Customer name — populated by the tenant-wide loader
   * (`getAllSubmissionsForTenant`) which JOINs `customers` via
   * `roles.customer_id`. `null` when the role has no linked customer, OR
   * when the loader doesn't join customers (per-role loader).
   */
  customerName: string | null
  candidateId: string
  sentAt: Date
  sentByUserId: string | null
  status: SubmissionStatus
  statusUpdatedAt: Date
  notes: string | null
  createdAt: Date
  shareToken: string | null
  shareTokenCreatedAt: Date | null
  candidate: {
    firstName: string
    lastName: string
    agencyId: string | null
    agencyName: string | null
    agencyLogoPath: string | null
    scoreOverall: number | null
  }
  submittedBy: {
    name: string
    email: string
  } | null
}

/**
 * Customer-visible projection returned by getSubmissionByToken.
 * MUST NOT include rates, margin, agency, internal notes, score breakdown,
 * recruiter identity, or any other tenant-internal commercial data.
 */
export type CustomerVisibleSubmission = {
  candidateFirstName: string
  candidateLastName: string
  roleTitle: string
  customerName: string | null
  tenantName: string
  status: SubmissionStatus
  sentAt: Date
  statusUpdatedAt: Date
}

export type SubmissionForDashboard = {
  id: string
  roleId: string
  roleTitle: string
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  status: SubmissionStatus
  statusUpdatedAt: Date
  sentAt: Date
  notes: string | null
}

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid('Invalid ID format')

export const submitCandidatesSchema = z.object({
  roleId: uuidSchema,
  candidateIds: z.array(uuidSchema).min(1, 'At least one candidate required'),
  notes: z.string().max(2000).optional(),
})

export const updateStatusSchema = z.object({
  submissionId: uuidSchema,
  status: z.enum([
    'submitted',
    'interview_scheduled',
    'interview_done',
    'feedback_pending',
    'hired',
    'rejected',
    'withdrawn',
  ]),
  notes: z.string().max(2000).optional(),
})

export const removeSubmissionSchema = z.object({
  submissionId: uuidSchema,
})

// ---------------------------------------------------------------------------
// Constants shared across read + public modules
// ---------------------------------------------------------------------------

export const STALE_STATUSES: SubmissionStatus[] = ['submitted', 'interview_scheduled', 'feedback_pending']

export const CUSTOMER_ALLOWED: readonly SubmissionStatus[] = [
  'interview_scheduled',
  'interview_done',
  'feedback_pending',
  'hired',
  'rejected',
] as const
