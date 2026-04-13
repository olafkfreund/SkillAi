import { sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import { auth } from '@/lib/auth'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

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
            ROUND((1 - (embedding <=> ${embeddingLiteral}::vector))::numeric, 3) AS similarity
          FROM candidates
          WHERE embedding IS NOT NULL
            AND is_active = true
          ORDER BY embedding <=> ${embeddingLiteral}::vector
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
