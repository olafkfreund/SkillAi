import { pgTable, pgPolicy, uuid, varchar, text, boolean, timestamp, unique, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

export const EMAIL_TEMPLATE_CATEGORIES = [
  'screening_invite',
  'scoring_decline',
  'post_interview',
  'rejection',
  'offer_pending',
  'custom',
] as const

export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number]

/**
 * Per-tenant reusable email templates for candidate communications.
 * Default templates (is_default=true) are seeded by seedDefaultTemplates();
 * user-created templates always have is_default=false.
 * The (tenant_id, name) unique constraint prevents accidental duplicates.
 */
export const emailTemplates = pgTable(
  'email_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    category: varchar('category', { length: 40 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    body: text('body').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('email_templates_tenant_name_unique').on(t.tenantId, t.name),
    index('idx_email_templates_tenant').on(t.tenantId, t.category),
    check(
      'email_templates_category_check',
      sql`${t.category} IN ('screening_invite','scoring_decline','post_interview','rejection','offer_pending','custom')`
    ),
    pgPolicy('email_templates_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type EmailTemplate = typeof emailTemplates.$inferSelect
export type NewEmailTemplate = typeof emailTemplates.$inferInsert
