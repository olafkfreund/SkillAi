import { pgTable, pgPolicy, pgEnum, uuid, varchar, text, boolean, timestamp, date, numeric } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'
import { customers } from './customers'

export const workModeEnum = pgEnum('work_mode', ['remote', 'hybrid', 'onsite'])

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
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    workMode: workModeEnum('work_mode'),
    languageRequirements: text('language_requirements').array().notNull().default(sql`'{}'::text[]`),
    keySkills: text('key_skills').array().notNull().default(sql`'{}'::text[]`),
    topRequirements: text('top_requirements').array().notNull().default(sql`'{}'::text[]`),
    priorityKeywords: text('priority_keywords').array().notNull().default(sql`'{}'::text[]`),
    priorityKeywordsUpdatedAt: timestamp('priority_keywords_updated_at'),
    targetFillDate: date('target_fill_date'),
    cutoffDate: date('cutoff_date'),
    customerPortalPath: varchar('customer_portal_path', { length: 500 }),
    customerDayRate: numeric('customer_day_rate', { precision: 10, scale: 2 }),
    rateCurrency: varchar('rate_currency', { length: 3 }),
    shortlistSentAt: timestamp('shortlist_sent_at'),
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
