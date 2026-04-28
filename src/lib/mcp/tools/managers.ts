/**
 * Hiring-manager MCP tools — surfaces the manager's assigned-roles view so
 * an LLM client (e.g. claude-desktop running as a manager) can fetch a
 * personalised dashboard.
 */

import { z } from 'zod'
import { getMyAssignedRoles } from '@/actions/role-managers'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// Empty input schema — uses no arguments, just the calling user's identity
export const NoInput = {} as const

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
}
