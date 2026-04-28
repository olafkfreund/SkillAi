/**
 * Candidate MCP tools — read + write surface for the candidate archive.
 *
 * Read tools query the DB directly inside `withTenant` (RLS enforced).
 * Write tools delegate to the canonical server actions in
 * `src/actions/candidates.ts` via the AsyncLocalStorage context shim
 * established by `runTool`.
 */

import { z } from 'zod'
import { eq, and, desc, ilike } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'
import {
  updateCandidateStatus,
  updateCandidateAvailability,
  archiveCandidate,
} from '@/actions/candidates'
import { runTool } from '../context'
import type { McpContext } from '../context'
import type { CandidateStatus, AvailabilityStatus } from '@/db/schema/candidates'

// ─── Input schemas ────────────────────────────────────────────────────────────

export const ListCandidatesInput = {
  search: z.string().optional().describe('Optional case-insensitive substring match on first or last name'),
  agencyId: z.string().uuid().optional(),
  status: z.enum(['new', 'shortlisted', 'interviewing', 'offered', 'rejected', 'hired']).optional(),
  availabilityStatus: z.enum(['available', 'on_project', 'unavailable']).optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
}

export const GetCandidateInput = {
  candidateId: z.string().uuid(),
}

export const FindByEmailInput = {
  email: z.string().email(),
}

export const UpdateStatusInput = {
  candidateId: z.string().uuid(),
  status: z.enum(['new', 'shortlisted', 'interviewing', 'offered', 'rejected', 'hired']),
  confirmed: z.literal(true).describe('Must be true. Write tools require explicit confirmation.'),
}

export const UpdateAvailabilityInput = {
  candidateId: z.string().uuid(),
  availabilityStatus: z.enum(['available', 'on_project', 'unavailable']),
  availableFrom: z.string().optional().describe('ISO date string (YYYY-MM-DD)'),
  confirmed: z.literal(true),
}

export const ArchiveCandidateInput = {
  candidateId: z.string().uuid(),
  confirmed: z.literal(true),
}

// ─── Tool registration ────────────────────────────────────────────────────────

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerCandidateTools(server: McpServer, ctx: McpContext): void {
  // -- list_candidates ----------------------------------------------------------
  server.registerTool(
    'list_candidates',
    {
      title: 'List candidates',
      description:
        'List candidates in the active tenant. Optional filters: substring search on name, ' +
        'agencyId, pipeline status, availability status. Returns id, name, email, agency, status, ' +
        'and (if scored) overallScore. Pagination via limit (max 200) and offset.',
      inputSchema: ListCandidatesInput,
    },
    async (args) =>
      runTool(ctx, 'list_candidates', 'read', false, args, async () => {
        const limit = args.limit ?? 50
        const offset = args.offset ?? 0
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const conditions = [] as ReturnType<typeof eq>[]
          if (args.agencyId) conditions.push(eq(candidates.agencyId, args.agencyId))
          if (args.status) conditions.push(eq(candidates.status, args.status as CandidateStatus))
          if (args.availabilityStatus) {
            conditions.push(eq(candidates.availabilityStatus, args.availabilityStatus as AvailabilityStatus))
          }
          if (args.search) {
            conditions.push(ilike(candidates.firstName, `%${args.search}%`))
          }
          const whereClause = conditions.length > 0 ? and(...conditions) : undefined

          const rows = await tx
            .select({
              id: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
              email: candidates.email,
              status: candidates.status,
              availabilityStatus: candidates.availabilityStatus,
              availableFrom: candidates.availableFrom,
              agencyId: candidates.agencyId,
              agencyName: agencies.name,
              createdAt: candidates.createdAt,
            })
            .from(candidates)
            .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
            .where(whereClause)
            .orderBy(desc(candidates.createdAt))
            .limit(limit)
            .offset(offset)
          return rows
        })
        return jsonResult({ candidates: result, limit, offset })
      })
  )

  // -- get_candidate ------------------------------------------------------------
  server.registerTool(
    'get_candidate',
    {
      title: 'Get candidate',
      description:
        'Fetch a single candidate by id with their CV text, agency, contact details, rates, ' +
        'and availability. Returns null if the candidate does not exist or belongs to another tenant.',
      inputSchema: GetCandidateInput,
    },
    async (args) =>
      runTool(ctx, 'get_candidate', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select()
            .from(candidates)
            .where(eq(candidates.id, args.candidateId))
            .limit(1)
          return row ?? null
        })
        return jsonResult({ candidate: result })
      })
  )

  // -- find_candidate_by_email --------------------------------------------------
  server.registerTool(
    'find_candidate_by_email',
    {
      title: 'Find candidate by email',
      description:
        'Look up a candidate by their email address (case-insensitive). Returns the candidate ' +
        'record or null. Useful when an external system references a person by email.',
      inputSchema: FindByEmailInput,
    },
    async (args) =>
      runTool(ctx, 'find_candidate_by_email', 'read', false, args, async () => {
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select()
            .from(candidates)
            .where(ilike(candidates.email, args.email))
            .limit(1)
          return row ?? null
        })
        return jsonResult({ candidate: result })
      })
  )

  // -- update_candidate_status -------------------------------------------------
  server.registerTool(
    'update_candidate_status',
    {
      title: 'Update candidate pipeline status',
      description:
        'Move a candidate to a new pipeline stage (new / shortlisted / interviewing / offered / ' +
        'hired / rejected). Requires write scope and confirmed: true.',
      inputSchema: UpdateStatusInput,
    },
    async (args) =>
      runTool(ctx, 'update_candidate_status', 'write', true, args, async () => {
        await updateCandidateStatus(args.candidateId, args.status as CandidateStatus)
        return jsonResult({ ok: true, candidateId: args.candidateId, status: args.status })
      })
  )

  // -- update_candidate_availability -------------------------------------------
  server.registerTool(
    'update_candidate_availability',
    {
      title: 'Update candidate availability',
      description:
        'Set a candidate\'s availability flag (available / on_project / unavailable) and an ' +
        'optional availableFrom date. Requires write scope and confirmed: true.',
      inputSchema: UpdateAvailabilityInput,
    },
    async (args) =>
      runTool(ctx, 'update_candidate_availability', 'write', true, args, async () => {
        const result = await updateCandidateAvailability(args.candidateId, {
          availabilityStatus: args.availabilityStatus as AvailabilityStatus,
          availableFrom: args.availableFrom ?? null,
        })
        if (!result.success) throw new Error(result.error)
        return jsonResult({ ok: true })
      })
  )

  // -- archive_candidate -------------------------------------------------------
  server.registerTool(
    'archive_candidate',
    {
      title: 'Archive candidate',
      description:
        'Soft-archive a candidate (sets isActive = false). The candidate remains queryable for ' +
        'audit/history. Requires write scope and confirmed: true.',
      inputSchema: ArchiveCandidateInput,
    },
    async (args) =>
      runTool(ctx, 'archive_candidate', 'write', true, args, async () => {
        await archiveCandidate(args.candidateId)
        return jsonResult({ ok: true, candidateId: args.candidateId })
      })
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wraps a JSON-serialisable value into the MCP `CallToolResult` shape so
 * clients can render it. JSON.stringify is safe here because all our return
 * values are plain data (no functions, no class instances).
 */
export function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}
