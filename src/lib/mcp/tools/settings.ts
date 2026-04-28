/**
 * Settings MCP tools — read-only listing for now. Save/remove API keys
 * involve secret material and are kept dashboard-only for the MVP.
 */

import { getConfiguredKeys } from '@/actions/settings'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const NoInput = {} as const

export function registerSettingsTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_configured_keys',
    {
      title: 'List configured API keys',
      description:
        'List which AI provider keys (anthropic / google / openai) are configured for the active ' +
        'tenant. Returns just the key NAMES, never the secret values. Admin scope required.',
      inputSchema: NoInput,
    },
    async (args) =>
      runTool(ctx, 'list_configured_keys', 'admin', false, args, async () => {
        const keys = await getConfiguredKeys(ctx.tenantId)
        return jsonResult({ configuredKeys: keys })
      })
  )
}
