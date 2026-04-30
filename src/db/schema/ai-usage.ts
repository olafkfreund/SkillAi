import {
  pgTable,
  pgPolicy,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
// Note: userId is intentionally not FK'd to users — background after() jobs have no user context.

/**
 * Records every AI call's token usage + cost for per-tenant analytics.
 *
 * userId is nullable: background after() jobs (post-upload scoring, async
 * enrichment, etc.) run without session context and log usage anonymously.
 *
 * Operation values are constrained at the application layer via the
 * AI_OPERATIONS const + AiOperation type below — kept out of the DB schema
 * so that adding a new AI surface doesn't require a migration.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'), // nullable — background after() jobs have no user
    operation: varchar('operation', { length: 64 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheCreationTokens: integer('cache_creation_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).notNull(),
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata'), // { entityId?, candidateId?, roleId?, ... }
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_usage_tenant_created').on(t.tenantId, t.createdAt),
    index('idx_ai_usage_operation').on(t.operation),
    pgPolicy('ai_usage_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type AiUsage = typeof aiUsage.$inferSelect
export type NewAiUsage = typeof aiUsage.$inferInsert

// Operation enum (TS const, not DB enum — keeps schema migrations cheap when
// new AI surfaces are added).
export const AI_OPERATIONS = [
  'cv_scoring_claude',
  'cv_scoring_gemini',
  'cv_profile_extract',
  'interview_pack_generate',
  'transcript_analysis',
  'cv_reformat',
  'synechron_extract',
  'profile_match',
  'role_fit',
  'shortlist_summary',
  'role_tag_extract',
  'embedding',
  'personal_site_summary',
  'welcome_letter_generate',
] as const
export type AiOperation = (typeof AI_OPERATIONS)[number]
