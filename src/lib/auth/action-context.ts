import { headers } from 'next/headers'
import type { UserRole } from '@/lib/auth/types'

export type ActionContext = {
  tenantId: string
  userId: string
  userRole: UserRole
}

/**
 * Extracts tenant/user context from middleware-injected headers.
 * Returns null if the request is unauthenticated (no tenant ID).
 * Safe to use in server actions — headers are set by Next.js middleware from JWT.
 */
export async function getActionContext(): Promise<ActionContext | null> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id') ?? ''
  const userRole = (headersList.get('x-user-role') ?? 'viewer') as UserRole
  if (!tenantId) return null
  return { tenantId, userId, userRole }
}
