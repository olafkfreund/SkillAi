import { pgTable, pgPolicy, uuid, varchar, text, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'

// Stores encrypted per-tenant configuration (API keys, future settings)
// Value column format: "iv:authTag:encryptedHex" (AES-256-GCM)
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value').notNull(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tenant_settings_tenant_key_unique').on(t.tenantId, t.key),
    index('idx_tenant_settings_lookup').on(t.tenantId, t.key),
    pgPolicy('tenant_settings_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type TenantSetting = typeof tenantSettings.$inferSelect
export type NewTenantSetting = typeof tenantSettings.$inferInsert
