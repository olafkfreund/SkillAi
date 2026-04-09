'use server'

import { headers } from 'next/headers'
import { withTenant } from '@/db'
import { scores } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { generateEmbedding } from '@/lib/ai/embeddings'

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
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return []

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
