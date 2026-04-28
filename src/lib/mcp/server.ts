/**
 * MCP server builder.
 *
 * `buildMcpServer(ctx)` returns a configured `McpServer` with every
 * tool / resource / prompt registered. Each is a closure over the
 * caller's `McpContext`, so handlers don't need to thread the tenant
 * through the SDK's `args`.
 *
 * A new server instance is constructed per HTTP request (the streamable
 * HTTP transport is per-request stateless in our deployment). Cost is
 * negligible: registration is just metadata + closure allocation.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from './tools'
import { registerAllResources } from './resources'
import { registerAllPrompts } from './prompts'
import type { McpContext } from './context'

const SERVER_INFO = {
  name: 'skillai',
  version: '1.0.0',
  title: 'SkillAi',
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  })

  registerAllTools(server, ctx)
  registerAllResources(server, ctx)
  registerAllPrompts(server, ctx)

  return server
}
