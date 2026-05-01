import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  integer,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'

export const scoreStatusEnum = pgEnum('score_status', [
  'pending',
  'processing',
  'complete',
  'failed',
])

export const scores = pgTable(
  'scores',
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
    scoreStatus: scoreStatusEnum('score_status').notNull().default('pending'),
    overallScore: integer('overall_score'),
    technicalScore: integer('technical_score'),
    experienceScore: integer('experience_score'),
    culturalFitScore: integer('cultural_fit_score'),
    communicationScore: integer('communication_score'),
    technicalReasoning: text('technical_reasoning'),
    experienceReasoning: text('experience_reasoning'),
    culturalFitReasoning: text('cultural_fit_reasoning'),
    communicationReasoning: text('communication_reasoning'),
    aiSummary: text('ai_summary'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('scores_candidate_role_unique').on(t.candidateId, t.roleId),
    index('idx_scores_role_overall').on(t.roleId, t.overallScore),
    index('idx_scores_candidate').on(t.candidateId),
    index('idx_scores_status_updated').on(t.scoreStatus, t.updatedAt.desc()),
    pgPolicy('scores_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type Score = typeof scores.$inferSelect
export type NewScore = typeof scores.$inferInsert
