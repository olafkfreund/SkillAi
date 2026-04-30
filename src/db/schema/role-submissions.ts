import { pgTable, pgPolicy, pgEnum, uuid, varchar, text, timestamp, unique, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { roles } from './roles'
import { candidates } from './candidates'
import { users } from './users'

export const submissionStatusEnum = pgEnum('submission_status', [
  'submitted',
  'interview_scheduled',
  'interview_done',
  'feedback_pending',
  'hired',
  'rejected',
  'withdrawn',
])

export const roleSubmissions = pgTable(
  'role_submissions',
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
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: submissionStatusEnum('status').notNull().default('submitted'),
    statusUpdatedAt: timestamp('status_updated_at').notNull().defaultNow(),
    notes: text('notes'),
    shareToken: varchar('share_token', { length: 64 }),
    shareTokenCreatedAt: timestamp('share_token_created_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('uniq_role_submissions_tenant_role_candidate').on(t.tenantId, t.roleId, t.candidateId),
    index('idx_role_submissions_role').on(t.roleId),
    index('idx_role_submissions_status').on(t.status, t.statusUpdatedAt),
    uniqueIndex('uniq_role_submissions_share_token')
      .on(t.shareToken)
      .where(sql`${t.shareToken} IS NOT NULL`),
    pgPolicy('role_submissions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type RoleSubmission = typeof roleSubmissions.$inferSelect
export type NewRoleSubmission = typeof roleSubmissions.$inferInsert
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number]
