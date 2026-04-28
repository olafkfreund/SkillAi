import { AsyncLocalStorage } from 'node:async_hooks'
import { headers } from 'next/headers'
import type { UserRole } from '@/lib/auth/types'

export type ActionContext = {
  tenantId: string
  userId: string
  userRole: UserRole
}

/**
 * AsyncLocalStorage-backed context override.
 *
 * Used when an action is called outside the normal HTTP middleware path
 * (e.g. from the MCP adapter at /api/mcp). The MCP route validates a
 * bearer token, looks up tenant/user/role, and runs the tool handler
 * inside `withActionContext(ctx, () => ...)`. Server actions then read
 * the ALS first, falling back to request headers for the standard flow.
 */
const actionContextStorage = new AsyncLocalStorage<ActionContext>()

/**
 * runWithActionContext — establish an ActionContext for the duration of
 * the callback. Server actions called inside `fn` will see this context
 * regardless of request headers. Used by the MCP adapter.
 */
export function runWithActionContext<T>(ctx: ActionContext, fn: () => Promise<T>): Promise<T> {
  return actionContextStorage.run(ctx, fn)
}

/**
 * Extracts tenant/user context.
 *
 * Resolution order:
 *   1. AsyncLocalStorage override (set by `runWithActionContext`)
 *   2. Middleware-injected request headers (the normal browser flow)
 *
 * Returns null if neither source provides a tenantId.
 */
export async function getActionContext(): Promise<ActionContext | null> {
  // ALS override — set by non-HTTP entry points (MCP, jobs, scripts)
  const overridden = actionContextStorage.getStore()
  if (overridden) return overridden

  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const userId = headersList.get('x-user-id') ?? ''
  const userRole = (headersList.get('x-user-role') ?? 'viewer') as UserRole
  if (!tenantId) return null
  return { tenantId, userId, userRole }
}
