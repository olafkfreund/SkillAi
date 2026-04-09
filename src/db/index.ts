import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

// Single connection pool shared across the process
const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })

export type Database = typeof db

/**
 * withTenant — executes a database operation inside a transaction with the
 * tenant RLS context set.
 *
 * All queries that touch tenant-scoped tables MUST run inside this wrapper.
 * It sets `app.tenant_id` as a LOCAL session variable so that PostgreSQL's
 * Row-Level Security policies can filter rows to the correct tenant.
 *
 * @example
 * const results = await withTenant(tenantId, (tx) => tx.select().from(roles))
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL scopes the variable to the current transaction only
    await tx.execute(sql`SELECT set_tenant_context(${tenantId}::uuid)`)
    return fn(tx as unknown as Database)
  })
}
