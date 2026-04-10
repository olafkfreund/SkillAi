'use server'

import { withTenant } from '@/db'
import { candidates, roles, scores } from '@/db/schema'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getActionContext } from '@/lib/auth/action-context'
import { analyseRoleFitForCandidate, type RoleFitResult } from '@/lib/ai/role-fit'

export async function getSuggestedCandidates(
  roleId: string,
  roleText: string,
  limit = 5
): Promise<Array<{
  id: string
  firstName: string
  lastName: string
  email: string | null
  similarity: number
}>> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  try {
    // Generate embedding for the role text
    const roleEmbedding = await generateEmbedding(roleText, tenantId)
    if (!roleEmbedding) return []

    const embeddingStr = JSON.stringify(roleEmbedding)

    // Find already-scored candidate IDs for this role (exclude them from suggestions)
    const alreadyScored = await withTenant(tenantId, async (tx) =>
      tx.select({ candidateId: scores.candidateId }).from(scores).where(eq(scores.roleId, roleId))
    )
    const excludeIds = alreadyScored.map((s) => s.candidateId)

    // Vector similarity search using raw SQL (pgvector cosine distance)
    const results = await withTenant(tenantId, async (tx) =>
      tx.execute(sql`
        SELECT
          id, first_name, last_name, email,
          ROUND((1 - (embedding_vec <=> ${embeddingStr}::vector))::numeric, 3) AS similarity
        FROM candidates
        WHERE
          tenant_id = current_setting('app.tenant_id', true)::uuid
          AND is_active = true
          AND embedding_vec IS NOT NULL
          ${excludeIds.length > 0 ? sql`AND id != ALL(${excludeIds}::uuid[])` : sql``}
        ORDER BY embedding_vec <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `)
    )

    return (Array.from(results) as Array<{
      id: string
      first_name: string
      last_name: string
      email: string | null
      similarity: number
    }>).map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      similarity: Math.round(Number(r.similarity) * 100),
    }))
  } catch (err) {
    console.error('[matching] getSuggestedCandidates failed:', err)
    return []
  }
}

export type RoleFitSuggestion = {
  role: { id: string; title: string; requirements: string }
  fit: RoleFitResult
}

/**
 * Analyse which active roles (not yet scored) are a good fit for a given candidate.
 *
 * Uses Claude structured output to generate per-role fit scores, pros, cons, and
 * a one-sentence headline for each role. Returns results sorted by fitScore descending.
 *
 * @param candidateId - UUID of the candidate to analyse
 * @returns Up to 8 role fit suggestions, or an empty array if the candidate has no CV text
 */
export async function getRoleFitSuggestionsForCandidate(
  candidateId: string
): Promise<RoleFitSuggestion[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId } = ctx

  try {
    // Fetch the candidate — we need cvText and the full name for the prompt
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          id: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          cvText: candidates.cvText,
          embedding: candidates.embedding,
        })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
        .limit(1)
    )

    if (!candidate || !candidate.cvText) return []

    // Find roles this candidate has already been scored against so we can exclude them
    const alreadyScoredRows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ roleId: scores.roleId })
        .from(scores)
        .where(eq(scores.candidateId, candidateId))
    )
    const alreadyScoredRoleIds = alreadyScoredRows.map((s) => s.roleId)

    // Fetch active roles the candidate has NOT yet been scored against (max 10 for Claude)
    const activeRoles = await withTenant(tenantId, async (tx) => {
      const baseQuery = tx
        .select({
          id: roles.id,
          title: roles.title,
          requirements: roles.requirements,
        })
        .from(roles)
        .where(
          alreadyScoredRoleIds.length > 0
            ? and(eq(roles.isActive, true), notInArray(roles.id, alreadyScoredRoleIds))
            : eq(roles.isActive, true)
        )
        .limit(10)

      return baseQuery
    })

    if (activeRoles.length === 0) return []

    const roleInputs = activeRoles.map((r) => ({
      roleId: r.id,
      roleTitle: r.title,
      roleRequirements: r.requirements,
    }))

    const candidateName = `${candidate.firstName} ${candidate.lastName}`
    const fitResults = await analyseRoleFitForCandidate(
      candidateName,
      candidate.cvText,
      roleInputs,
      tenantId
    )

    // Join results back to role metadata and sort by fitScore descending
    const roleMap = new Map(activeRoles.map((r) => [r.id, r]))

    const suggestions: RoleFitSuggestion[] = fitResults
      .flatMap((fit) => {
        const role = roleMap.get(fit.roleId)
        if (!role) return []
        return [{ role: { id: role.id, title: role.title, requirements: role.requirements }, fit }]
      })
      .sort((a, b) => b.fit.fitScore - a.fit.fitScore)
      .slice(0, 8)

    return suggestions
  } catch (err) {
    console.error('[matching] getRoleFitSuggestionsForCandidate failed:', err)
    return []
  }
}
