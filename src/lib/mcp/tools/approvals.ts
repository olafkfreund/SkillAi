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
  sendShortlistForApproval,
  approveAllRemaining,
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

export const SendShortlistInput = {
  roleId: z.string().uuid(),
  confirmed: z.literal(true),
}

export const ApproveAllInput = {
  roleId: z.string().uuid(),
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
    'send_shortlist_for_approval',
    {
      title: 'Send shortlist for approval',
      description:
        'Mark a role\'s shortlist as sent to its assigned hiring managers and seed pending ' +
        'approval rows for every (shortlisted candidate × manager) pair. Idempotent — re-sending ' +
        'does not reset existing decisions. Recruiter/admin only. Requires write scope and confirmed: true.',
      inputSchema: SendShortlistInput,
    },
    async (args) =>
      runTool(ctx, 'send_shortlist_for_approval', 'write', true, args, async () => {
        const result = await sendShortlistForApproval(args.roleId)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true, roleId: args.roleId })
      })
  )

  server.registerTool(
    'approve_all_remaining',
    {
      title: 'Approve all remaining candidates (hiring manager)',
      description:
        'Bulk-approve every still-pending approval row owned by the calling manager on the role. ' +
        'Manager scope (the calling user must be assigned as a manager on the role). Optional ' +
        'comment is applied to every row. Requires write scope and confirmed: true.',
      inputSchema: ApproveAllInput,
    },
    async (args) =>
      runTool(ctx, 'approve_all_remaining', 'write', true, args, async () => {
        const result = await approveAllRemaining(args.roleId, args.comment)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true, roleId: args.roleId })
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
