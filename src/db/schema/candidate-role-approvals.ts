import { pgTable, pgPolicy, uuid, varchar, text, timestamp, unique, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { roles } from './roles'
import { candidates } from './candidates'
import { users } from './users'

/**
 * Per-candidate approval decisions captured during the hiring-manager review
 * (Epic #73). One row per (role, candidate, manager) triple — each manager
 * casts an independent verdict on each candidate they were shown.
 *
 * decision is constrained to 'pending' | 'approved' | 'rejected' both at the
 * DB level (CHECK constraint) and the TS level (APPROVAL_DECISIONS const).
 */
export const candidateRoleApprovals = pgTable(
  'candidate_role_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    decision: varchar('decision', { length: 20 }).notNull().default('pending'),
    comment: text('comment'),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('approvals_role_candidate_manager_unique').on(t.roleId, t.candidateId, t.managerId),
    index('idx_approvals_role_manager').on(t.roleId, t.managerId),
    check('approvals_decision_check', sql`${t.decision} IN ('pending','approved','rejected')`),
    pgPolicy('approvals_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type CandidateRoleApproval = typeof candidateRoleApprovals.$inferSelect
export type NewCandidateRoleApproval = typeof candidateRoleApprovals.$inferInsert

export const APPROVAL_DECISIONS = ['pending', 'approved', 'rejected'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]
