/**
 * MCP tool registry barrel.
 *
 * Each `registerXxx` function takes the MCP server and the per-request
 * context and registers all tools in its category. Adding a new category
 * means: write the file, register it here, and update the help article.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpContext } from '../context'

import { registerCandidateTools } from './candidates'
import { registerRoleTools } from './roles'
import { registerAgencyTools } from './agencies'
import { registerCustomerTools } from './customers'
import { registerScoringTools } from './scoring'
import { registerInterviewTools } from './interviews'
import { registerApprovalTools } from './approvals'
import { registerManagerTools } from './managers'
import { registerNoteTools } from './notes'
import { registerUserTools } from './users'
import { registerSettingsTools } from './settings'
import { registerExportTools } from './exports'

export function registerAllTools(server: McpServer, ctx: McpContext): void {
  registerCandidateTools(server, ctx)
  registerRoleTools(server, ctx)
  registerAgencyTools(server, ctx)
  registerCustomerTools(server, ctx)
  registerScoringTools(server, ctx)
  registerInterviewTools(server, ctx)
  registerApprovalTools(server, ctx)
  registerManagerTools(server, ctx)
  registerNoteTools(server, ctx)
  registerUserTools(server, ctx)
  registerSettingsTools(server, ctx)
  registerExportTools(server, ctx)
}
