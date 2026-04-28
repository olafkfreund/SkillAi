/**
 * Role MCP tools — read + lifecycle for roles in the active tenant.
 */

import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roles, scores, candidates, customers } from '@/db/schema'
import { archiveRole } from '@/actions/roles'
import { runTool } from '../context'
import type { McpContext } from '../context'
import { jsonResult } from './candidates'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const ListRolesInput = {
  activeOnly: z.boolean().optional().default(true).describe('Hide archived roles'),
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
}

export const GetRoleInput = {
  roleId: z.string().uuid(),
}

export const GetRoleWithCandidatesInput = {
  roleId: z.string().uuid(),
  minScore: z.number().int().min(0).max(100).optional().describe('Minimum overallScore filter'),
  limit: z.number().int().min(1).max(200).optional().default(50),
}

export const ArchiveRoleInput = {
  roleId: z.string().uuid(),
  confirmed: z.literal(true),
}

export function registerRoleTools(server: McpServer, ctx: McpContext): void {
  // -- list_roles ---------------------------------------------------------------
  server.registerTool(
    'list_roles',
    {
      title: 'List roles',
      description:
        'List job roles in the active tenant with their customer, location, deadlines, and ' +
        'budget. By default hides archived roles (set activeOnly=false to include them).',
      inputSchema: ListRolesInput,
    },
    async (args) =>
      runTool(ctx, 'list_roles', 'read', false, args, async () => {
        const limit = args.limit ?? 50
        const offset = args.offset ?? 0
        const activeOnly = args.activeOnly ?? true
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const where = activeOnly ? eq(roles.isActive, true) : undefined
          const rows = await tx
            .select({
              id: roles.id,
              title: roles.title,
              isActive: roles.isActive,
              customerId: roles.customerId,
              customerName: customers.name,
              country: roles.country,
              city: roles.city,
              workMode: roles.workMode,
              targetFillDate: roles.targetFillDate,
              cutoffDate: roles.cutoffDate,
              customerDayRate: roles.customerDayRate,
              rateCurrency: roles.rateCurrency,
              createdAt: roles.createdAt,
            })
            .from(roles)
            .leftJoin(customers, eq(roles.customerId, customers.id))
            .where(where)
            .orderBy(desc(roles.createdAt))
            .limit(limit)
            .offset(offset)
          return rows
        })
        return jsonResult({ roles: result, limit, offset })
      })
  )

  // -- get_role -----------------------------------------------------------------
  server.registerTool(
    'get_role',
    {
      title: 'Get role',
      description:
        'Fetch a single role by id with description, requirements, key skills, top requirements, ' +
        'language requirements, and budget. Returns null if not found.',
      inputSchema: GetRoleInput,
    },
    async (args) =>
      runTool(ctx, 'get_role', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx.select().from(roles).where(eq(roles.id, args.roleId)).limit(1)
          return row ?? null
        })
        return jsonResult({ role: result })
      })
  )

  // -- get_role_with_candidates ------------------------------------------------
  server.registerTool(
    'get_role_with_candidates',
    {
      title: 'Get role with ranked candidates',
      description:
        'Fetch a role and the candidates scored against it, sorted by overallScore descending. ' +
        'Includes per-dimension scores. Optional minScore filter.',
      inputSchema: GetRoleWithCandidatesInput,
    },
    async (args) =>
      runTool(ctx, 'get_role_with_candidates', 'read', false, args, async () => {
        const limit = args.limit ?? 50
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [role] = await tx.select().from(roles).where(eq(roles.id, args.roleId)).limit(1)
          if (!role) return { role: null, candidates: [] }
          const conditions = [eq(scores.roleId, args.roleId)]
          // overallScore filter applied at app layer; null-safe
          const rows = await tx
            .select({
              candidateId: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
              status: candidates.status,
              overallScore: scores.overallScore,
              technicalScore: scores.technicalScore,
              experienceScore: scores.experienceScore,
              culturalFitScore: scores.culturalFitScore,
              communicationScore: scores.communicationScore,
              scoreStatus: scores.scoreStatus,
            })
            .from(scores)
            .innerJoin(candidates, eq(scores.candidateId, candidates.id))
            .where(and(...conditions))
            .orderBy(desc(scores.overallScore))
            .limit(limit)
          const filtered =
            args.minScore !== undefined
              ? rows.filter((r) => (r.overallScore ?? -1) >= args.minScore!)
              : rows
          return { role, candidates: filtered }
        })
        return jsonResult(result)
      })
  )

  // -- archive_role -------------------------------------------------------------
  server.registerTool(
    'archive_role',
    {
      title: 'Archive role',
      description: 'Soft-archive a role (isActive=false). Requires write scope and confirmed: true.',
      inputSchema: ArchiveRoleInput,
    },
    async (args) =>
      runTool(ctx, 'archive_role', 'write', true, args, async () => {
        await archiveRole(args.roleId)
        return jsonResult({ ok: true, roleId: args.roleId })
      })
  )
}
