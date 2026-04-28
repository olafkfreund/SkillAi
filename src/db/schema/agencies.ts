import { pgTable, pgPolicy, uuid, varchar, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 50 }),
    notes: text('notes'),
    logoPath: varchar('logo_path', { length: 500 }),
    isActive: boolean('is_active').notNull().default(true),
    isInternal: boolean('is_internal').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_agencies_tenant_internal')
      .on(t.tenantId)
      .where(sql`is_internal`),
    pgPolicy('agencies_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type Agency = typeof agencies.$inferSelect
export type NewAgency = typeof agencies.$inferInsert
