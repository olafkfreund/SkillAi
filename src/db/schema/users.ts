import { pgTable, pgPolicy, pgEnum, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

export const userRoleEnum = pgEnum('user_role', ['admin', 'recruiter', 'hiring_manager', 'viewer'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull().default('recruiter'),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    passwordResetRequired: boolean('password_reset_required').notNull().default(false),
    lastPasswordChangeAt: timestamp('last_password_change_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Allow reads when tenant context is set (normal dashboard use)
    pgPolicy('users_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
    // Allow auth login queries: email lookup without tenant context set yet
    pgPolicy('users_auth_lookup', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`current_setting('app.tenant_id', true) IS NULL OR current_setting('app.tenant_id', true) = ''`,
    }),
  ]
).enableRLS()

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
