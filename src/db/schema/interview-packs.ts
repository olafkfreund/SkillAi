import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'
import { users } from './users'

export const generationStatusEnum = pgEnum('generation_status', [
  'pending',
  'processing',
  'complete',
  'failed',
])

export const experienceLevelEnum = pgEnum('experience_level', [
  'junior',
  'mid',
  'senior',
  'lead',
])

export const interviewPacks = pgTable(
  'interview_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    generationStatus: generationStatusEnum('generation_status').notNull().default('pending'),
    generationStage: text('generation_stage'),
    experienceLevel: experienceLevelEnum('experience_level'),
    recommendedDurationMinutes: integer('recommended_duration_minutes'),
    includesCodeChallenge: boolean('includes_code_challenge').notNull().default(false),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_interview_packs_candidate').on(t.candidateId),
    index('idx_interview_packs_role').on(t.roleId),
    pgPolicy('interview_packs_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type InterviewPack = typeof interviewPacks.$inferSelect
export type NewInterviewPack = typeof interviewPacks.$inferInsert
