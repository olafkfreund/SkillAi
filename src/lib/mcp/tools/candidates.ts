/**
 * Candidate MCP tools — read + write surface for the candidate archive.
 *
 * Read tools query the DB directly inside `withTenant` (RLS enforced).
 * Write tools delegate to the canonical server actions in
 * `src/actions/candidates.ts` via the AsyncLocalStorage context shim
 * established by `runTool`.
 */

import { z } from 'zod'
import { eq, and, desc, ilike, sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores, agencies, roles } from '@/db/schema'
import {
  updateCandidateStatus,
  updateCandidateAvailability,
  archiveCandidate,
  createCandidate,
} from '@/actions/candidates'
import { getSuggestedCandidates } from '@/actions/matching'
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

export const FindByNameInput = {
  name: z.string().min(1).describe(
    'Case-insensitive substring match against the concatenated "first last" name. Max 20 results.'
  ),
}

export const SemanticSearchInput = {
  roleId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Find candidates whose embeddings are most similar to this role\'s description. ' +
        'Already-scored candidates on the role are excluded.'
    ),
  query: z
    .string()
    .optional()
    .describe(
      'Free-text query (LIMITATION v1: not yet supported by the underlying matching action; ' +
        'returns a clear error when used without roleId).'
    ),
  limit: z.number().int().min(1).max(50).optional().default(10),
}

// CV-file payload for create_candidate. Mirrors the file-upload contract used
// by the dashboard: the LLM hands us the raw bytes base64-encoded, we
// reconstitute a Web `File` and feed it through the same server action the
// browser uses, so validation, parsing, persistence, scoring, and embedding
// behave identically across paths.
const CvFilePayload = z.object({
  filename: z.string().min(1).max(300),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'text/rtf',
    'text/plain',
    'text/markdown',
  ]),
  dataBase64: z.string().min(1).describe('Base64-encoded file bytes (max 10MB after decode)'),
})

export const CreateCandidateInput = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  // The createCandidate server action requires roleId — the candidate's first
  // score row is created against this role at insert time. Surfaced as required
  // here even though the spec listed it as optional, because the action itself
  // will reject without it.
  roleId: z.string().uuid().describe('The role to score the candidate against on creation'),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  agencyId: z.string().uuid().optional(),
  candidateRate: z.number().min(0).optional(),
  customerRate: z.number().min(0).optional(),
  rateCurrency: z.enum(['GBP', 'EUR', 'USD', 'PLN']).optional(),
  cvFile: CvFilePayload,
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

  // -- find_candidate_by_name --------------------------------------------------
  server.registerTool(
    'find_candidate_by_name',
    {
      title: 'Find candidate by name',
      description:
        'Case-insensitive substring match against `firstName + " " + lastName`. Returns up to ' +
        '20 matches with their agency. Useful when the LLM has only a free-text name.',
      inputSchema: FindByNameInput,
    },
    async (args) =>
      runTool(ctx, 'find_candidate_by_name', 'read', false, args, async () => {
        // Match against the concatenated "first last" so a query like "ada lovelace"
        // hits both halves at once. Single ILIKE keeps the index strategy simple
        // and avoids ranking trade-offs.
        const pattern = `%${args.name.trim()}%`
        const result = await withTenant(ctx.tenantId, async (tx) => {
          const rows = await tx
            .select({
              id: candidates.id,
              firstName: candidates.firstName,
              lastName: candidates.lastName,
              email: candidates.email,
              status: candidates.status,
              agencyName: agencies.name,
            })
            .from(candidates)
            .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
            .where(
              ilike(sql`${candidates.firstName} || ' ' || ${candidates.lastName}`, pattern)
            )
            .orderBy(candidates.lastName, candidates.firstName)
            .limit(20)
          return rows
        })
        return jsonResult({ candidates: result })
      })
  )

  // -- semantic_search_candidates ----------------------------------------------
  server.registerTool(
    'semantic_search_candidates',
    {
      title: 'Semantic candidate search',
      description:
        'Vector-similarity search for candidates against a role\'s description using pgvector ' +
        'cosine distance. Provide `roleId` (the action embeds the role text). Already-scored ' +
        'candidates on the role are excluded. NOTE v1: free-text `query` is accepted by the ' +
        'schema but returns a clear error — the underlying matching action only supports ' +
        'roleId-based search at present.',
      inputSchema: SemanticSearchInput,
    },
    async (args) =>
      runTool(ctx, 'semantic_search_candidates', 'read', false, args, async () => {
        if (!args.roleId && !args.query) {
          throw new Error('Either roleId or query is required')
        }
        if (!args.roleId) {
          // Free-text mode is documented as unsupported in v1. Fail loudly so
          // the LLM knows to switch strategies rather than silently returning
          // an empty list.
          throw new Error(
            'semantic_search_candidates: free-text `query` mode is not supported in v1. ' +
              'Pass `roleId` instead — the matching action embeds the role text for you.'
          )
        }
        // Look up the role text (description + requirements) so the matching
        // action has something to embed.
        const roleRow = await withTenant(ctx.tenantId, async (tx) => {
          const [r] = await tx
            .select({
              description: roles.description,
              requirements: roles.requirements,
              title: roles.title,
            })
            .from(roles)
            .where(eq(roles.id, args.roleId!))
            .limit(1)
          return r ?? null
        })
        if (!roleRow) throw new Error('Role not found')
        const roleText = [roleRow.title, roleRow.description, roleRow.requirements]
          .filter(Boolean)
          .join('\n\n')
        const limit = args.limit ?? 10
        const suggestions = await getSuggestedCandidates(args.roleId, roleText, limit)
        // Re-shape into { id, name, email, score, agencyName }. similarity is
        // already 0-100 from the action.
        const ids = suggestions.map((s) => s.id)
        const agencyMap = new Map<string, string | null>()
        if (ids.length > 0) {
          await withTenant(ctx.tenantId, async (tx) => {
            const rows = await tx
              .select({
                id: candidates.id,
                agencyName: agencies.name,
              })
              .from(candidates)
              .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
              .where(eq(candidates.tenantId, ctx.tenantId))
            for (const r of rows) {
              if (ids.includes(r.id)) agencyMap.set(r.id, r.agencyName ?? null)
            }
          })
        }
        return jsonResult({
          candidates: suggestions.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            email: s.email,
            score: s.similarity,
            agencyName: agencyMap.get(s.id) ?? null,
          })),
        })
      })
  )

  // -- create_candidate --------------------------------------------------------
  server.registerTool(
    'create_candidate',
    {
      title: 'Create candidate from CV',
      description:
        'Create a new candidate by uploading a CV (base64-encoded). The CV is validated, ' +
        'parsed, stored, and a pending score row is queued against the supplied roleId. ' +
        'Embedding generation runs in the background. Max 10MB per file. Requires write scope ' +
        'and confirmed: true.',
      inputSchema: CreateCandidateInput,
    },
    async (args) =>
      runTool(ctx, 'create_candidate', 'write', true, args, async () => {
        // Decode + size-check before we hit the action so we can return a clean
        // error rather than a generic "validation failed" downstream.
        const buf = Buffer.from(args.cvFile.dataBase64, 'base64')
        if (buf.byteLength === 0) {
          throw new Error('cvFile.dataBase64 decoded to zero bytes')
        }
        if (buf.byteLength > 10 * 1024 * 1024) {
          throw new Error('cvFile exceeds 10MB limit')
        }
        // Synthesize a Web File so we can reuse the createCandidate FormData
        // path. `File` is a `Blob` with a name — node 22 has both globally.
        const file = new File([buf], args.cvFile.filename, { type: args.cvFile.mimeType })
        const fd = new FormData()
        fd.set('firstName', args.firstName)
        fd.set('lastName', args.lastName)
        fd.set('roleId', args.roleId)
        if (args.email) fd.set('email', args.email)
        if (args.phone) fd.set('phone', args.phone)
        if (args.agencyId) fd.set('agencyId', args.agencyId)
        if (typeof args.candidateRate === 'number') fd.set('candidateRate', String(args.candidateRate))
        if (typeof args.customerRate === 'number') fd.set('customerRate', String(args.customerRate))
        if (args.rateCurrency) fd.set('rateCurrency', args.rateCurrency)
        fd.set('cvFile', file)
        const result = await createCandidate(null, fd)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create candidate')
        }
        return jsonResult({
          candidateId: result.candidateId,
          status: 'parsing',
          message:
            'Candidate created. Scoring + embedding generation are running in the background — ' +
            'use get_candidate_score to poll.',
        })
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
