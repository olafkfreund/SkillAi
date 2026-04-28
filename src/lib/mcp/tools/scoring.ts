/**
 * Scoring MCP tools — read existing scores and trigger a rescore.
 *
 * `rescore_candidate` is fire-and-forget; the actual AI work runs in the
 * background. The tool returns immediately and clients should poll
 * `get_candidate_score` to see the updated score once it completes.
 */

import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { scores } from '@/db/schema'
import { rescoreCandidate } from '@/actions/scores'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const GetScoreInput = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
}

export const RescoreInput = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
  confirmed: z.literal(true),
}

export function registerScoringTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_candidate_score',
    {
      title: 'Get candidate score',
      description:
        'Fetch the score row for a candidate against a specific role, including all four ' +
        'dimension scores (technical, experience, cultural fit, communication), AI reasoning ' +
        'per dimension, and the AI summary. Returns null if no scoring run exists yet.',
      inputSchema: GetScoreInput,
    },
    async (args) =>
      runTool(ctx, 'get_candidate_score', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select()
            .from(scores)
            .where(and(eq(scores.candidateId, args.candidateId), eq(scores.roleId, args.roleId)))
            .limit(1)
          return row ?? null
        })
        return jsonResult({ score: result })
      })
  )

  server.registerTool(
    'rescore_candidate',
    {
      title: 'Rescore candidate against role',
      description:
        'Re-run AI scoring for a candidate against a role. The score is reset to pending and ' +
        'the AI pipeline runs in the background. Poll get_candidate_score for results. ' +
        'Requires write scope and confirmed: true.',
      inputSchema: RescoreInput,
    },
    async (args) =>
      runTool(ctx, 'rescore_candidate', 'write', true, args, async () => {
        const result = await rescoreCandidate(args.candidateId, args.roleId)
        if (!result.success) throw new Error(result.error ?? 'rescore failed')
        return jsonResult({ ok: true, candidateId: args.candidateId, roleId: args.roleId })
      })
  )
}
