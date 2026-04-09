import { pgTable, pgPolicy, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'
import { customers } from './customers'

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    requirements: text('requirements').notNull(),
    filePath: varchar('file_path', { length: 500 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    frameworkLevelId: varchar('framework_level_id', { length: 50 }),
    frameworkLevelLabel: varchar('framework_level_label', { length: 200 }),
    keySkills: text('key_skills').array().notNull().default(sql`'{}'::text[]`),
    topRequirements: text('top_requirements').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('roles_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
