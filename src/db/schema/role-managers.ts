import { pgTable, pgPolicy, uuid, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { roles } from './roles'
import { users } from './users'

/**
 * Junction table: which hiring-manager users are assigned to which roles.
 * Enables the hiring-manager view (Epic #73) — managers see only the roles
 * their tenant admin/recruiter has assigned them to.
 *
 * isPrimary marks the lead manager for a role (used for default routing of
 * shortlist handoff notifications). At most one primary per role is enforced
 * at the application layer (no partial unique index needed for now).
 */
export const roleManagers = pgTable(
  'role_managers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    addedBy: uuid('added_by').references(() => users.id),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => [
    unique('role_managers_role_user_unique').on(t.roleId, t.userId),
    index('idx_role_managers_user').on(t.userId),
    index('idx_role_managers_role').on(t.roleId),
    pgPolicy('role_managers_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type RoleManager = typeof roleManagers.$inferSelect
export type NewRoleManager = typeof roleManagers.$inferInsert
