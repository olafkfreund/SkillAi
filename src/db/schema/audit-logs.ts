import { pgTable, pgPolicy, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),           // nullable — system actions have no user
    userEmail: varchar('user_email', { length: 200 }),
    action: varchar('action', { length: 100 }).notNull(),   // e.g. 'candidate.created', 'score.deleted'
    entityType: varchar('entity_type', { length: 50 }).notNull(), // 'candidate', 'role', 'score', etc.
    entityId: uuid('entity_id'),       // nullable for bulk/list actions
    entityLabel: varchar('entity_label', { length: 200 }), // human-readable e.g. "John Smith"
    metadata: jsonb('metadata'),       // extra context (role title, score value, etc.)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_logs_tenant_created').on(t.tenantId, t.createdAt),
    index('idx_audit_logs_entity').on(t.entityType, t.entityId),
    pgPolicy('audit_logs_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
