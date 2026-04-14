import { agencies } from '@/db/schema'

/**
 * Ensure the per-tenant "Internal" system agency exists.
 *
 * Called by the seed script and by bulk-assign operations when no internal
 * agency is present. Guaranteed idempotent via the
 * `uniq_agencies_tenant_internal` partial unique index.
 *
 * Accepts any Drizzle tx-like object (seed uses the raw db; actions use a
 * `withTenant` tx). Typed as `any` to avoid leaking the Drizzle generic types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureInternalAgency(tx: any, tenantId: string) {
  await tx
    .insert(agencies)
    .values({
      tenantId,
      name: 'Internal',
      isInternal: true,
      isSystem: true,
      isActive: true,
    })
    .onConflictDoNothing()
}
