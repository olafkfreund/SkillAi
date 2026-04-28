/**
 * Customer MCP tools — list and fetch the customer entities used as the
 * client-side of role engagements.
 */

import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { withTenant } from '@/db'
import { customers } from '@/db/schema'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const ListCustomersInput = {
  includeArchived: z.boolean().optional().default(false),
}

export const GetCustomerInput = {
  customerId: z.string().uuid(),
}

export function registerCustomerTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_customers',
    {
      title: 'List customers',
      description: 'List customer entities (the companies we hire for). Archived rows hidden by default.',
      inputSchema: ListCustomersInput,
    },
    async (args) =>
      runTool(ctx, 'list_customers', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const where = args.includeArchived ? undefined : eq(customers.isActive, true)
          const rows = await tx
            .select()
            .from(customers)
            .where(where)
            .orderBy(desc(customers.createdAt))
          return rows
        })
        return jsonResult({ customers: result })
      })
  )

  server.registerTool(
    'get_customer',
    {
      title: 'Get customer',
      description:
        'Fetch a single customer by id with portal URL, contact details, and active status.',
      inputSchema: GetCustomerInput,
    },
    async (args) =>
      runTool(ctx, 'get_customer', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select()
            .from(customers)
            .where(eq(customers.id, args.customerId))
            .limit(1)
          return row ?? null
        })
        return jsonResult({ customer: result })
      })
  )
}
