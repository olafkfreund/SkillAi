/**
 * MCP per-request context + tool helpers.
 *
 * Every MCP request validates a bearer token and produces an `McpContext`.
 * Tool handlers close over this context so they know who's calling and
 * what scopes they hold.
 *
 * Scope inclusion mirrors `requireScope` in `src/lib/api/auth-middleware.ts`:
 *   admin > write > read
 */

import { runWithActionContext } from '@/lib/auth/action-context'
import { emitAudit } from '@/lib/audit-middleware'
import type { ApiTokenScope } from '@/db/schema/api-tokens'
import type { UserRole } from '@/lib/auth/types'

export type McpContext = {
  tenantId: string
  userId: string
  tokenId: string
  scopes: ApiTokenScope[]
  /**
   * The user's product-role (admin/recruiter/viewer) inferred from the user
   * record at token-issue time. Server actions use this to gate writes.
   */
  userRole: UserRole
}

/**
 * mcpRequireScope — returns true if the granted scopes satisfy `required`.
 * admin satisfies all; write satisfies write+read; read only satisfies read.
 */
export function mcpRequireScope(required: ApiTokenScope, granted: ApiTokenScope[]): boolean {
  for (const s of granted) {
    if (s === 'admin') return true
    if (s === 'write' && (required === 'write' || required === 'read')) return true
    if (s === 'read' && required === 'read') return true
  }
  return false
}

/**
 * Error thrown when a tool is invoked without sufficient scope. Surfaced as
 * an MCP tool error rather than an HTTP error.
 */
export class McpScopeError extends Error {
  constructor(required: ApiTokenScope) {
    super(`insufficient_scope: this tool requires '${required}' scope`)
    this.name = 'McpScopeError'
  }
}

/**
 * Error thrown when a write tool is invoked without `confirmed: true`.
 */
export class McpConfirmRequiredError extends Error {
  constructor(toolName: string) {
    super(
      `confirmation_required: '${toolName}' is a write action. ` +
        `Re-call with confirmed: true once the user has explicitly approved the change.`
    )
    this.name = 'McpConfirmRequiredError'
  }
}

/**
 * Wraps a tool handler with: scope check, action-context ALS setup, and
 * audit logging. Used by every tool registered on the MCP server.
 */
export async function runTool<T>(
  ctx: McpContext,
  toolName: string,
  requiredScope: ApiTokenScope,
  isWrite: boolean,
  args: unknown,
  fn: () => Promise<T>
): Promise<T> {
  if (!mcpRequireScope(requiredScope, ctx.scopes)) {
    throw new McpScopeError(requiredScope)
  }

  if (isWrite) {
    // Write tools require an explicit { confirmed: true } gate
    const a = (args ?? {}) as Record<string, unknown>
    if (a.confirmed !== true) {
      throw new McpConfirmRequiredError(toolName)
    }
  }

  // Audit before running so we have a trace even if the handler throws
  emitAudit(ctx.tenantId, {
    action: isWrite ? 'mcp.confirmed_action' : 'mcp.tool_called',
    entityType: 'mcp_tool',
    entityLabel: toolName,
    metadata: { tokenId: ctx.tokenId, userId: ctx.userId, scopes: ctx.scopes },
  })

  // Establish ActionContext so server actions called inside the tool see
  // the right tenant/user/role without depending on HTTP middleware headers.
  return runWithActionContext(
    { tenantId: ctx.tenantId, userId: ctx.userId, userRole: ctx.userRole },
    fn
  )
}
