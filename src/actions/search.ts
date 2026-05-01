'use server'

import { ilike, eq, or, and, desc } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, roles, customers, agencies } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'

export type GlobalSearchHit =
  | { kind: 'candidate'; id: string; firstName: string; lastName: string; email: string | null; agencyName: string | null }
  | { kind: 'role'; id: string; title: string; customerName: string | null; customerRoleId: string | null }
  | { kind: 'customer'; id: string; name: string }
  | { kind: 'agency'; id: string; name: string; isInternal: boolean }

export type GlobalSearchResult = {
  candidates: Array<Extract<GlobalSearchHit, { kind: 'candidate' }>>
  roles: Array<Extract<GlobalSearchHit, { kind: 'role' }>>
  customers: Array<Extract<GlobalSearchHit, { kind: 'customer' }>>
  agencies: Array<Extract<GlobalSearchHit, { kind: 'agency' }>>
}

const EMPTY: GlobalSearchResult = { candidates: [], roles: [], customers: [], agencies: [] }

export async function searchGlobal(query: string): Promise<GlobalSearchResult> {
  const ctx = await getActionContext()
  // No auth-error throw — return empty so the palette degrades silently on
  // unauthenticated requests rather than surfacing an error to the UI.
  if (!ctx) return EMPTY

  // Recruiters and admins only (requireRole throws; catch silently here)
  try {
    requireRole(ctx.userRole, 'recruiter')
  } catch {
    return EMPTY
  }

  const q = query.trim()
  if (q.length < 2) return EMPTY

  const { tenantId } = ctx
  const pattern = `%${q}%`

  return withTenant(tenantId, async (tx) => {
    const [candidateRows, roleRows, customerRows, agencyRows] = await Promise.all([
      // Candidates — search firstName, lastName, email; join agencies for name
      tx
        .select({
          id: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email,
          agencyName: agencies.name,
        })
        .from(candidates)
        .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
        .where(
          and(
            eq(candidates.isActive, true),
            or(
              ilike(candidates.firstName, pattern),
              ilike(candidates.lastName, pattern),
              ilike(candidates.email, pattern)
            )
          )
        )
        .orderBy(desc(candidates.createdAt))
        .limit(5),

      // Roles — search title and customerRoleId; join customers for name
      tx
        .select({
          id: roles.id,
          title: roles.title,
          customerRoleId: roles.customerRoleId,
          customerName: customers.name,
        })
        .from(roles)
        .leftJoin(customers, eq(roles.customerId, customers.id))
        .where(
          and(
            eq(roles.isActive, true),
            or(
              ilike(roles.title, pattern),
              ilike(roles.customerRoleId, pattern)
            )
          )
        )
        .orderBy(desc(roles.createdAt))
        .limit(5),

      // Customers — search name
      tx
        .select({
          id: customers.id,
          name: customers.name,
        })
        .from(customers)
        .where(
          and(
            eq(customers.isActive, true),
            ilike(customers.name, pattern)
          )
        )
        .orderBy(desc(customers.createdAt))
        .limit(5),

      // Agencies — search name; include isInternal
      tx
        .select({
          id: agencies.id,
          name: agencies.name,
          isInternal: agencies.isInternal,
        })
        .from(agencies)
        .where(
          and(
            eq(agencies.isActive, true),
            ilike(agencies.name, pattern)
          )
        )
        .orderBy(desc(agencies.createdAt))
        .limit(5),
    ])

    return {
      candidates: candidateRows.map((r) => ({
        kind: 'candidate' as const,
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email ?? null,
        agencyName: r.agencyName ?? null,
      })),
      roles: roleRows.map((r) => ({
        kind: 'role' as const,
        id: r.id,
        title: r.title,
        customerName: r.customerName ?? null,
        customerRoleId: r.customerRoleId ?? null,
      })),
      customers: customerRows.map((r) => ({
        kind: 'customer' as const,
        id: r.id,
        name: r.name,
      })),
      agencies: agencyRows.map((r) => ({
        kind: 'agency' as const,
        id: r.id,
        name: r.name,
        isInternal: r.isInternal,
      })),
    }
  })
}
