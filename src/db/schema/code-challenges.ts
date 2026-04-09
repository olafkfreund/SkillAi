import { pgTable, pgPolicy, uuid, varchar, text, integer, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { interviewPacks } from './interview-packs'

export const codeChallenges = pgTable(
  'code_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packId: uuid('pack_id')
      .notNull()
      .unique()
      .references(() => interviewPacks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    problemDescription: text('problem_description').notNull(),
    starterCode: text('starter_code').notNull(),
    language: varchar('language', { length: 50 }).notNull().default('typescript'),
    unitTests: text('unit_tests'),
    evaluationCriteria: text('evaluation_criteria'),
    estimatedMinutes: integer('estimated_minutes'),
  },
  (t) => [
    index('idx_code_challenges_pack').on(t.packId),
    pgPolicy('code_challenges_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM interview_packs ip
        WHERE ip.id = ${t.packId}
          AND ip.tenant_id = current_setting('app.tenant_id', true)::uuid
      )`,
    }),
  ]
).enableRLS()

export type CodeChallenge = typeof codeChallenges.$inferSelect
export type NewCodeChallenge = typeof codeChallenges.$inferInsert
