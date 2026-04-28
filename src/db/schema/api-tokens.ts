import { pgTable, pgPolicy, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'

/**
 * Valid scopes for API tokens.
 * Used for validation in token creation and access control in middleware.
 */
export const apiTokenScopes = ['read', 'write', 'admin'] as const
export type ApiTokenScope = (typeof apiTokenScopes)[number]

/**
 * api_tokens — machine-to-machine authentication tokens for the MCP gateway
 * and any future external API consumers (Epic #105).
 *
 * Only the argon2 hash of the raw token is stored. The prefix (first 12 chars
 * of the token including env discriminator) is stored in plaintext for O(1)
 * lookup before hash verification. The raw token is returned to the caller
 * exactly once at creation time.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** First 12 chars of the raw token — used as a fast lookup key */
    prefix: varchar('prefix', { length: 20 }).notNull().unique(),
    /** argon2id hash of the full raw token */
    hash: varchar('hash', { length: 500 }).notNull(),
    /** Array of granted scopes: 'read' | 'write' | 'admin' */
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('api_tokens_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type ApiToken = typeof apiTokens.$inferSelect
export type NewApiToken = typeof apiTokens.$inferInsert
