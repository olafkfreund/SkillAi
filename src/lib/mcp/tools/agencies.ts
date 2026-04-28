/**
 * Agency MCP tools — read-only listing for now. Creation/edit go through
 * the dashboard server actions; LLM-driven agency creation is intentionally
 * out of scope for the MVP.
 */

import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { withTenant } from '@/db'
import { agencies } from '@/db/schema'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const ListAgenciesInput = {
  includeArchived: z.boolean().optional().default(false),
}

export const GetAgencyInput = {
  agencyId: z.string().uuid(),
}

export function registerAgencyTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_agencies',
    {
      title: 'List agencies',
      description:
        'List recruitment agencies in the active tenant. The internal-employee bench is exposed ' +
        'as the system "Internal" agency (isInternal=true). Hides archived rows by default.',
      inputSchema: ListAgenciesInput,
    },
    async (args) =>
      runTool(ctx, 'list_agencies', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const where = args.includeArchived ? undefined : eq(agencies.isActive, true)
          const rows = await tx
            .select()
            .from(agencies)
            .where(where)
            .orderBy(desc(agencies.isInternal), agencies.name)
          return rows
        })
        return jsonResult({ agencies: result })
      })
  )

  server.registerTool(
    'get_agency',
    {
      title: 'Get agency',
      description: 'Fetch a single agency by id with its contact details and notes.',
      inputSchema: GetAgencyInput,
    },
    async (args) =>
      runTool(ctx, 'get_agency', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select()
            .from(agencies)
            .where(eq(agencies.id, args.agencyId))
            .limit(1)
          return row ?? null
        })
        return jsonResult({ agency: result })
      })
  )
}
