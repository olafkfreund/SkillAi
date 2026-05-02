/**
 * RLS isolation integration test
 *
 * Verifies that Row-Level Security prevents tenants from seeing each other's data.
 * Requires a real PostgreSQL connection (no mocking).
 * Run with: npm test tests/integration/db/rls-isolation.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { tenants } from '@/db/schema/tenants'
import { agencies } from '@/db/schema/agencies'

// These tests insert real rows + then delete them. They MUST NOT run against
// a developer's working DB — running with just DATABASE_URL set was too loose,
// because the dev container always has DATABASE_URL pointing at the live DB.
// Opt-in via RUN_DB_INTEGRATION_TESTS=1 from a dedicated test database.
const REQUIRES_DB =
  !!process.env.RUN_DB_INTEGRATION_TESTS && !!process.env.DATABASE_URL

describe.skipIf(!REQUIRES_DB)('RLS isolation', () => {
  let tenantAId: string
  let tenantBId: string

  beforeAll(async () => {
    // Create two isolated tenants for the test
    const [tenantA] = await db
      .insert(tenants)
      .values({ name: 'Test Tenant A', slug: `rls-test-a-${Date.now()}` })
      .returning({ id: tenants.id })

    const [tenantB] = await db
      .insert(tenants)
      .values({ name: 'Test Tenant B', slug: `rls-test-b-${Date.now()}` })
      .returning({ id: tenants.id })

    tenantAId = tenantA.id
    tenantBId = tenantB.id

    // Insert one agency per tenant
    await withTenant(tenantAId, async (tx) => {
      await tx.insert(agencies).values({
        tenantId: tenantAId,
        name: 'Agency Alpha',
        isActive: true,
      })
    })

    await withTenant(tenantBId, async (tx) => {
      await tx.insert(agencies).values({
        tenantId: tenantBId,
        name: 'Agency Beta',
        isActive: true,
      })
    })
  })

  afterAll(async () => {
    // Clean up — delete tenants (cascades to agencies via FK)
    if (tenantAId) await db.delete(tenants).where(sql`id = ${tenantAId}`)
    if (tenantBId) await db.delete(tenants).where(sql`id = ${tenantBId}`)
  })

  it('tenant A can only see its own agencies', async () => {
    const rows = await withTenant(tenantAId, async (tx) => {
      return tx.select().from(agencies)
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Agency Alpha')
    expect(rows[0].tenantId).toBe(tenantAId)
  })

  it('tenant B can only see its own agencies', async () => {
    const rows = await withTenant(tenantBId, async (tx) => {
      return tx.select().from(agencies)
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Agency Beta')
    expect(rows[0].tenantId).toBe(tenantBId)
  })

  it('tenant A cannot read tenant B records even by ID', async () => {
    // Get the agency ID from tenant B's context
    const [agencyB] = await withTenant(tenantBId, async (tx) => {
      return tx.select({ id: agencies.id }).from(agencies)
    })

    // Try to read it from tenant A's context
    const rows = await withTenant(tenantAId, async (tx) => {
      return tx
        .select()
        .from(agencies)
        .where(sql`${agencies.id} = ${agencyB.id}`)
    })

    expect(rows).toHaveLength(0)
  })

  it('queries outside withTenant see no tenant-scoped rows', async () => {
    // No tenant context set — RLS should block everything
    const rows = await db.select().from(agencies)
    // Rows belonging to our test tenants must not appear
    const testRows = rows.filter(
      (r) => r.tenantId === tenantAId || r.tenantId === tenantBId
    )
    expect(testRows).toHaveLength(0)
  })
})
