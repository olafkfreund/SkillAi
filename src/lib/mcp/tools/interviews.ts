/**
 * Interview MCP tools — read interview packs (full + pre-screening). Pack
 * GENERATION is intentionally not exposed via MCP in this MVP because it's
 * a long-running AI workflow with progress streaming; LLM clients should
 * trigger it via the dashboard. We expose listing + reading for now.
 */

import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions } from '@/db/schema'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const ListPacksInput = {
  candidateId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
}

export const GetPackInput = {
  packId: z.string().uuid(),
}

export function registerInterviewTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_interview_packs',
    {
      title: 'List interview packs',
      description:
        'List interview packs in the active tenant. Filter by candidateId and/or roleId. ' +
        'Includes generation status (pending/processing/complete/failed), packType, language, ' +
        'and recommended duration.',
      inputSchema: ListPacksInput,
    },
    async (args) =>
      runTool(ctx, 'list_interview_packs', 'read', false, args, async () => {
        const limit = args.limit ?? 20
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const conds: ReturnType<typeof eq>[] = []
          if (args.candidateId) conds.push(eq(interviewPacks.candidateId, args.candidateId))
          if (args.roleId) conds.push(eq(interviewPacks.roleId, args.roleId))
          const where = conds.length > 0 ? and(...conds) : undefined
          const rows = await tx
            .select()
            .from(interviewPacks)
            .where(where)
            .orderBy(desc(interviewPacks.createdAt))
            .limit(limit)
          return rows
        })
        return jsonResult({ packs: result })
      })
  )

  server.registerTool(
    'get_interview_pack',
    {
      title: 'Get interview pack',
      description:
        'Fetch a full interview pack (the pack record plus all generated questions). Returns ' +
        '{ pack: null, questions: [] } if the pack id is not found in the active tenant.',
      inputSchema: GetPackInput,
    },
    async (args) =>
      runTool(ctx, 'get_interview_pack', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [pack] = await tx
            .select()
            .from(interviewPacks)
            .where(eq(interviewPacks.id, args.packId))
            .limit(1)
          if (!pack) return { pack: null, questions: [] }
          const questions = await tx
            .select()
            .from(interviewQuestions)
            .where(eq(interviewQuestions.packId, args.packId))
          return { pack, questions }
        })
        return jsonResult(result)
      })
  )
}
