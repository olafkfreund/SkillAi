import { pgTable, pgPolicy, uuid, varchar, text, boolean, timestamp, jsonb, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { customers } from './customers'

export type FrameworkLevel = {
  id: string          // e.g. "gcb4"
  code: string        // e.g. "GCB 4"
  title: string       // e.g. "Specialist Engineering"
  description: string // e.g. "VP equivalent..."
  order: number       // for sorting (0 = most senior for HSBC, ascending for others)
}

export const customerFrameworks = pgTable(
  'customer_frameworks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    levels: jsonb('levels').$type<FrameworkLevel[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('customer_frameworks_customer_id_unique').on(t.customerId),
    pgPolicy('customer_frameworks_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type CustomerFramework = typeof customerFrameworks.$inferSelect
export type NewCustomerFramework = typeof customerFrameworks.$inferInsert
