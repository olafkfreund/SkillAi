import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { agencies } from './agencies'

// Extended file type enum — includes all supported CV formats
export const fileTypeEnum = pgEnum('file_type', ['pdf', 'docx', 'odt', 'rtf', 'txt', 'md'])

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
    filePath: varchar('file_path', { length: 500 }),
    fileType: fileTypeEnum('file_type').notNull(),
    // embedding stored as text (vector(1536)) — managed via pgvector in Phase 2
    // Using text column with cast for compatibility; Phase 2 adds HNSW index
    embedding: text('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_candidates_tenant').on(t.tenantId),
    index('idx_candidates_agency').on(t.agencyId),
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
