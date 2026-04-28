/**
 * Role MCP tools — read + lifecycle for roles in the active tenant.
 */

import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roles, scores, candidates, customers } from '@/db/schema'
import { archiveRole, updateRole, regenerateRoleTags } from '@/actions/roles'
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

// updateRole's server action validates these via UpdateRoleSchema. The action
// requires title/description/requirements every time (it does a full replace,
// not a patch), so we surface them as required here too — the MCP caller must
// pass the canonical values they want stored. Optional keys remain optional.
export const UpdateRoleInput = {
  roleId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(10),
  requirements: z.string().min(10),
  customerId: z.string().uuid().nullable().optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  languageRequirements: z
    .string()
    .optional()
    .describe('Comma-separated language list, e.g. "English, Polish"'),
  customerDayRate: z.number().min(0).optional(),
  rateCurrency: z.enum(['GBP', 'EUR', 'USD', 'PLN']).optional(),
  targetFillDate: z.string().optional().describe('ISO date YYYY-MM-DD'),
  cutoffDate: z.string().optional().describe('ISO date YYYY-MM-DD'),
  customerPortalPath: z.string().max(500).optional(),
  priorityKeywords: z.array(z.string().min(2).max(120)).max(15).optional(),
  confirmed: z.literal(true),
}

export const RegenerateRoleTagsInput = {
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

  // -- update_role --------------------------------------------------------------
  server.registerTool(
    'update_role',
    {
      title: 'Update role',
      description:
        'Edit an existing role. The server action does a full replace of the editable fields — ' +
        'title/description/requirements are always required. Optional fields default to null/empty ' +
        'when omitted. Tag regeneration runs after the response. Requires write scope and confirmed: true.',
      inputSchema: UpdateRoleInput,
    },
    async (args) =>
      runTool(ctx, 'update_role', 'write', true, args, async () => {
        // Mirror the FormData shape that the dashboard form uses, since the
        // server action signature is `updateRole(roleId, _prev, formData)`.
        const fd = new FormData()
        fd.set('title', args.title)
        fd.set('description', args.description)
        fd.set('requirements', args.requirements)
        if (args.customerId) fd.set('customerId', args.customerId)
        if (args.country) fd.set('country', args.country)
        if (args.city) fd.set('city', args.city)
        if (args.workMode) fd.set('workMode', args.workMode)
        if (args.languageRequirements) fd.set('languageRequirements', args.languageRequirements)
        if (typeof args.customerDayRate === 'number') {
          fd.set('customerDayRate', String(args.customerDayRate))
        }
        if (args.rateCurrency) fd.set('rateCurrency', args.rateCurrency)
        if (args.targetFillDate) fd.set('targetFillDate', args.targetFillDate)
        if (args.cutoffDate) fd.set('cutoffDate', args.cutoffDate)
        if (args.customerPortalPath) fd.set('customerPortalPath', args.customerPortalPath)
        // Action expects priorityKeywords as JSON-stringified array (matches the
        // form encoding path documented in roles.ts).
        if (args.priorityKeywords) {
          fd.set('priorityKeywords', JSON.stringify(args.priorityKeywords))
        }
        const result = await updateRole(args.roleId, null, fd)
        if (!result.success) {
          throw new Error(result.error || 'Failed to update role')
        }
        return jsonResult({ ok: true, roleId: args.roleId })
      })
  )

  // -- regenerate_role_tags ----------------------------------------------------
  server.registerTool(
    'regenerate_role_tags',
    {
      title: 'Regenerate role tags',
      description:
        'Re-run AI tag extraction (key skills + top requirements) for a role using its current ' +
        'description and requirements. Runs in the background after the response. Requires write ' +
        'scope and confirmed: true.',
      inputSchema: RegenerateRoleTagsInput,
    },
    async (args) =>
      runTool(ctx, 'regenerate_role_tags', 'write', true, args, async () => {
        const result = await regenerateRoleTags(args.roleId)
        if (!result.success) {
          throw new Error(result.error || 'Failed to regenerate tags')
        }
        return jsonResult({ ok: true, roleId: args.roleId })
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
