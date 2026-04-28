/**
 * User-management MCP tools (admin scope).
 *
 * `list_users` delegates to `listTenantUsers` (uses ActionContext).
 *
 * `update_user_role` and `deactivate_user` need a small implementation
 * mirror because the underlying server actions read `auth()` — which is a
 * NextAuth session helper that only works inside the standard HTTP/cookie
 * flow. We can't synthesise a session from a bearer token without
 * modifying the action. We therefore reproduce the (small, audited) logic
 * here against `withTenant` so the MCP path stays clean.
 */

import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { users } from '@/db/schema'
import { listTenantUsers } from '@/actions/users'
import { writeAuditLog } from '@/lib/audit'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { UserRole } from '@/lib/auth/types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const ListUsersInput = {} as const

export const UpdateRoleInput = {
  userId: z.string().uuid(),
  role: z.enum(['admin', 'recruiter', 'hiring_manager', 'viewer']),
  confirmed: z.literal(true),
}

export const DeactivateUserInput = {
  userId: z.string().uuid(),
  confirmed: z.literal(true),
}

export function registerUserTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_users',
    {
      title: 'List tenant users',
      description: 'List all users in the active tenant. Admin scope required.',
      inputSchema: ListUsersInput,
    },
    async (args) =>
      runTool(ctx, 'list_users', 'admin', false, args, async () => {
        const result = await listTenantUsers()
        return jsonResult({ users: result })
      })
  )

  server.registerTool(
    'update_user_role',
    {
      title: 'Update user role',
      description:
        'Change a user\'s product-role (admin / recruiter / hiring_manager / viewer). You cannot ' +
        'change your own role. Admin scope required, confirmed: true required.',
      inputSchema: UpdateRoleInput,
    },
    async (args) =>
      runTool(ctx, 'update_user_role', 'admin', true, args, async () => {
        if (args.userId === ctx.userId) {
          throw new Error('You cannot change your own role')
        }
        await withTenant(ctx.tenantId, async (tx) => {
          await tx
            .update(users)
            .set({ role: args.role as UserRole })
            .where(and(eq(users.id, args.userId), eq(users.tenantId, ctx.tenantId)))
        })
        void writeAuditLog(ctx.tenantId, {
          action: 'user.role_changed',
          entityType: 'user',
          entityId: args.userId,
          metadata: { newRole: args.role, by: ctx.userId, via: 'mcp' },
        })
        return jsonResult({ ok: true, userId: args.userId, role: args.role })
      })
  )

  server.registerTool(
    'deactivate_user',
    {
      title: 'Deactivate user',
      description:
        'Soft-deactivate a user (sets isActive=false). You cannot deactivate yourself. Admin ' +
        'scope and confirmed: true required.',
      inputSchema: DeactivateUserInput,
    },
    async (args) =>
      runTool(ctx, 'deactivate_user', 'admin', true, args, async () => {
        if (args.userId === ctx.userId) {
          throw new Error('You cannot deactivate your own account')
        }
        await withTenant(ctx.tenantId, async (tx) => {
          await tx
            .update(users)
            .set({ isActive: false })
            .where(and(eq(users.id, args.userId), eq(users.tenantId, ctx.tenantId)))
        })
        void writeAuditLog(ctx.tenantId, {
          action: 'user.deactivated',
          entityType: 'user',
          entityId: args.userId,
          metadata: { by: ctx.userId, via: 'mcp' },
        })
        return jsonResult({ ok: true, userId: args.userId })
      })
  )
}
