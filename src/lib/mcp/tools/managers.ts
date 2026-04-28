/**
 * Hiring-manager MCP tools — surfaces the manager's assigned-roles view so
 * an LLM client (e.g. claude-desktop running as a manager) can fetch a
 * personalised dashboard.
 */

import { z } from 'zod'
import {
  getMyAssignedRoles,
  assignRoleManagers,
  removeRoleManager,
  getRoleManagers,
} from '@/actions/role-managers'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// Empty input schema — uses no arguments, just the calling user's identity
export const NoInput = {} as const

export const AssignManagersInput = {
  roleId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).describe(
    'Replacement set of hiring-manager user IDs. Pass [] to clear all assignments. ' +
      'Non-hiring_manager users are silently dropped by the action.'
  ),
  primaryUserId: z
    .string()
    .uuid()
    .optional()
    .describe('Optional — must also appear in userIds to take effect'),
  confirmed: z.literal(true),
}

export const RemoveManagerInput = {
  roleId: z.string().uuid(),
  userId: z.string().uuid(),
  confirmed: z.literal(true),
}

export const GetRoleManagersInput = {
  roleId: z.string().uuid(),
}

export function registerManagerTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_my_assigned_roles',
    {
      title: 'Get my assigned roles (hiring manager)',
      description:
        'For the calling hiring manager, list every role that has been assigned to them with ' +
        'pending and decided counts. Returns an empty list if the caller is not a manager.',
      inputSchema: NoInput,
    },
    async (args) =>
      runTool(ctx, 'get_my_assigned_roles', 'read', false, args, async () => {
        const result = await getMyAssignedRoles()
        return jsonResult({ assignedRoles: result })
      })
  )

  server.registerTool(
    'get_role_managers',
    {
      title: 'Get role managers',
      description:
        'List the hiring managers currently assigned to a role, with email, name, primary flag, ' +
        'and added-at timestamp. Returns [] if no managers are assigned (or role does not exist).',
      inputSchema: GetRoleManagersInput,
    },
    async (args) =>
      runTool(ctx, 'get_role_managers', 'read', false, args, async () => {
        const result = await getRoleManagers(args.roleId)
        return jsonResult({ managers: result })
      })
  )

  server.registerTool(
    'assign_role_managers',
    {
      title: 'Assign role managers',
      description:
        'Replace the full set of hiring managers for a role with the supplied userIds. Non-' +
        'hiring_manager users are silently dropped. If primaryUserId is supplied AND is in the ' +
        'valid set it is flagged as primary. Recruiter/admin only. Requires write scope and confirmed: true.',
      inputSchema: AssignManagersInput,
    },
    async (args) =>
      runTool(ctx, 'assign_role_managers', 'write', true, args, async () => {
        const result = await assignRoleManagers(args.roleId, args.userIds, args.primaryUserId)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true, roleId: args.roleId })
      })
  )

  server.registerTool(
    'remove_role_manager',
    {
      title: 'Remove role manager',
      description:
        'Detach a single hiring manager from a role. Recruiter/admin only. Requires write scope ' +
        'and confirmed: true.',
      inputSchema: RemoveManagerInput,
    },
    async (args) =>
      runTool(ctx, 'remove_role_manager', 'write', true, args, async () => {
        const result = await removeRoleManager(args.roleId, args.userId)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )
}
