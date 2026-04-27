import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  numeric,
  index,
  date,
  jsonb,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { agencies } from './agencies'
import { users } from './users'

// Extended file type enum — includes all supported CV formats
export const fileTypeEnum = pgEnum('file_type', ['pdf', 'docx', 'odt', 'rtf', 'txt', 'md'])

// Candidate lifecycle status
export const candidateStatusEnum = pgEnum('candidate_status', [
  'new',
  'shortlisted',
  'interviewing',
  'offered',
  'rejected',
  'hired',
])

export type CandidateStatus = (typeof candidateStatusEnum.enumValues)[number]

// Candidate availability (orthogonal to pipeline status)
export const availabilityStatusEnum = pgEnum('availability_status', [
  'available',
  'on_project',
  'unavailable',
])

export type AvailabilityStatus = (typeof availabilityStatusEnum.enumValues)[number]

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    cvText: text('cv_text').notNull(),
    cvTextFormatted: text('cv_text_formatted'),
    filePath: varchar('file_path', { length: 500 }),
    fileType: fileTypeEnum('file_type').notNull(),
    linkedinUrl: varchar('linkedin_url', { length: 500 }),
    githubUsername: varchar('github_username', { length: 100 }),
    // embedding stored as text (vector(1536)) — managed via pgvector in Phase 2
    // Using text column with cast for compatibility; Phase 2 adds HNSW index
    embedding: text('embedding'),
    status: candidateStatusEnum('status').notNull().default('new'),
    statusConfirmedBy: uuid('status_confirmed_by').references(() => users.id),
    statusConfirmedAt: timestamp('status_confirmed_at', { withTimezone: true }),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    languagesSpoken: text('languages_spoken').array().notNull().default(sql`'{}'::text[]`),
    willingToRelocate: boolean('willing_to_relocate'),
    candidateRate: numeric('candidate_rate', { precision: 10, scale: 2 }),
    customerRate: numeric('customer_rate', { precision: 10, scale: 2 }),
    rateCurrency: varchar('rate_currency', { length: 3 }),
    availabilityStatus: availabilityStatusEnum('availability_status').notNull().default('available'),
    availableFrom: date('available_from'),
    isActive: boolean('is_active').notNull().default(true),
    synechronCvData: jsonb('synechron_cv_data'),
    synechronCandidateId: varchar('synechron_candidate_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_candidates_tenant').on(t.tenantId),
    index('idx_candidates_agency').on(t.agencyId),
    index('idx_candidates_agency_availability').on(t.agencyId, t.availabilityStatus),
    pgPolicy('candidates_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type Candidate = typeof candidates.$inferSelect
export type NewCandidate = typeof candidates.$inferInsert
