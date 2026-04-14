import { pgTable, pgPolicy, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'

/**
 * Structured CV profile extracted by Claude from candidate.cvText.
 * One row per candidate — upserted on re-extraction.
 *
 * Populated by src/lib/ai/cv-profile.ts::triggerCvProfileExtraction (background)
 * after candidate upload. Consumed by the candidate detail page and by
 * interview pack generation (cached to avoid repeat AI calls).
 */
export const cvProfiles = pgTable(
  'cv_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    experienceLevel: text('experience_level'),
    summary: text('summary'),
    technicalSkills: jsonb('technical_skills').$type<string[]>().default([]),
    companies: jsonb('companies').$type<Array<{
      name: string
      role: string
      keyAchievements: string[]
    }>>().default([]),
    personalizableMoments: jsonb('personalizable_moments').$type<string[]>().default([]),
    extractionStatus: text('extraction_status').notNull().default('pending'),
    errorMessage: text('error_message'),
    aiModel: text('ai_model'),
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_cv_profiles_tenant').on(t.tenantId),
    pgPolicy('cv_profiles_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type CvProfileRow = typeof cvProfiles.$inferSelect
export type NewCvProfile = typeof cvProfiles.$inferInsert
