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
import { createInterviewPack } from '@/actions/interview'
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

export const GenerateInterviewPackInput = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
  language: z
    .string()
    .optional()
    .describe('ISO 639-1 language code, e.g. "en", "pl". Defaults to "en".'),
  includeCodeChallenge: z
    .boolean()
    .optional()
    .describe('Only honoured for level=full_technical. Pre-screening packs never include code.'),
  level: z
    .enum(['pre_screening', 'full_technical'])
    .optional()
    .describe('Pack type. Defaults to "full_technical".'),
  confirmed: z.literal(true),
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
    'generate_interview_pack',
    {
      title: 'Generate interview pack',
      description:
        'Queue an interview pack generation job for a candidate × role pair. The pack is created ' +
        'with status="pending" — actual AI generation runs in the background; the LLM should poll ' +
        'get_interview_pack to fetch the questions once status="complete". Pre-screening packs ' +
        'are short, full_technical packs are longer and may include a code challenge. Recruiter/admin only. ' +
        'Requires write scope and confirmed: true.',
      inputSchema: GenerateInterviewPackInput,
    },
    async (args) =>
      runTool(ctx, 'generate_interview_pack', 'write', true, args, async () => {
        const fd = new FormData()
        fd.set('candidateId', args.candidateId)
        fd.set('roleId', args.roleId)
        fd.set('packType', args.level ?? 'full_technical')
        fd.set('language', args.language ?? 'en')
        // The action coerces 'true'/'false' strings to bool. Pre-screening
        // path always wins regardless of this flag (server-side override).
        fd.set('includeCodeChallenge', args.includeCodeChallenge ? 'true' : 'false')
        const result = await createInterviewPack(null, fd)
        if (!result.success) throw new Error(result.error)
        return jsonResult({ packId: result.packId, status: 'queued' })
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
