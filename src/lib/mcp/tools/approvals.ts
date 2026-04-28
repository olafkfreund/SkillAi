/**
 * Approval MCP tools — hiring-manager-side surface for shortlist approvals.
 *
 * Reads (`get_approvals_for_role`) and writes (`approve_candidate`,
 * `reject_candidate`) all delegate to the canonical actions in
 * `src/actions/approvals.ts`. The actions enforce role-based gating
 * (manager/admin) via the resolved ActionContext.
 */

import { z } from 'zod'
import {
  approveCandidate,
  rejectCandidate,
  getApprovalsForRole,
} from '@/actions/approvals'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const GetApprovalsInput = {
  roleId: z.string().uuid(),
}

export const DecisionInput = {
  roleId: z.string().uuid(),
  candidateId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
  confirmed: z.literal(true),
}

export function registerApprovalTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_approvals_for_role',
    {
      title: 'Get approvals for role',
      description:
        'Fetch the approval state for every shortlisted candidate × assigned manager combination ' +
        'on a role. Returns approval status (pending/approved/rejected), decided-at timestamps, ' +
        'and comments. Used by recruiters to track shortlist progress.',
      inputSchema: GetApprovalsInput,
    },
    async (args) =>
      runTool(ctx, 'get_approvals_for_role', 'read', false, args, async () => {
        const result = await getApprovalsForRole(args.roleId)
        return jsonResult({ approvals: result })
      })
  )

  server.registerTool(
    'approve_candidate',
    {
      title: 'Approve candidate (hiring manager)',
      description:
        'Record a manager approval for a candidate on a role. Only assigned managers (or admins) ' +
        'may decide. Optional comment. Requires write scope and confirmed: true.',
      inputSchema: DecisionInput,
    },
    async (args) =>
      runTool(ctx, 'approve_candidate', 'write', true, args, async () => {
        const result = await approveCandidate(args.roleId, args.candidateId, args.comment)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )

  server.registerTool(
    'reject_candidate',
    {
      title: 'Reject candidate (hiring manager)',
      description:
        'Record a manager rejection for a candidate on a role. Only assigned managers (or admins) ' +
        'may decide. Optional comment. Requires write scope and confirmed: true.',
      inputSchema: DecisionInput,
    },
    async (args) =>
      runTool(ctx, 'reject_candidate', 'write', true, args, async () => {
        const result = await rejectCandidate(args.roleId, args.candidateId, args.comment)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )
}
