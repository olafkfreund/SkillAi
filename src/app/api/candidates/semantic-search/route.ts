import { sql } from 'drizzle-orm'
import { withTenant } from '@/db'

export async function POST(request: Request) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query: string
  let limit: number

  try {
    const body = await request.json() as { query?: string; limit?: number }
    query = body.query ?? ''
    limit = body.limit ?? 8
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!query.trim()) {
    return Response.json({ results: [] })
  }

  try {
    const { generateEmbedding } = await import('@/lib/ai/embeddings')
    const queryEmbedding = await generateEmbedding(query, tenantId)
    const embeddingLiteral = JSON.stringify(queryEmbedding)

    const results = await withTenant(tenantId, async (tx) => {
      return tx.execute(
        sql`
          SELECT
            id,
            first_name,
            last_name,
            email,
            status,
            ROUND((1 - (embedding_vec <=> ${embeddingLiteral}::vector))::numeric, 3) AS similarity
          FROM candidates
          WHERE embedding_vec IS NOT NULL
            AND is_active = true
          ORDER BY embedding_vec <=> ${embeddingLiteral}::vector
          LIMIT ${limit}
        `
      )
    })

    // drizzle-orm/postgres-js execute() returns the RowList directly (an array)
    return Response.json({ results: Array.from(results) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Semantic search failed'
    console.error('[semantic-search]', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
