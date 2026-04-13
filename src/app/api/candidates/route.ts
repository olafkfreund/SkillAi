import { NextResponse } from 'next/server'
import { desc, eq, and, gte, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { searchParams } = new URL(request.url)
  const roleId = searchParams.get('roleId')
  const minScore = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : undefined

  // Pagination params — limit capped at 200, default 50
  const parsedLimit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? 50)), 200)
  const parsedOffset = Math.max(0, Number(searchParams.get('offset') ?? 0))

  const result = await withTenant(tenantId, async (tx) => {
    // Build join condition — always match candidateId, optionally filter by roleId
    const joinCondition = and(
      eq(scores.candidateId, candidates.id),
      roleId ? eq(scores.roleId, roleId) : undefined
    )

    // Build where clause — optionally filter by minimum score
    const whereClause = minScore !== undefined
      ? gte(scores.overallScore, minScore)
      : undefined

    const rows = await tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        createdAt: candidates.createdAt,
        agencyName: agencies.name,
        scoreId: scores.id,
        overallScore: scores.overallScore,
        scoreStatus: scores.scoreStatus,
        roleId: scores.roleId,
      })
      .from(candidates)
      .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
      .leftJoin(scores, joinCondition)
      .where(whereClause)
      .orderBy(desc(scores.overallScore), desc(candidates.createdAt))
      .limit(parsedLimit)
      .offset(parsedOffset)

    // Count must also respect the minScore filter for accurate pagination
    const countQuery = tx
      .select({ value: count() })
      .from(candidates)
      .leftJoin(scores, joinCondition)
      .where(whereClause)

    const [{ value: totalCount }] = await countQuery

    return { rows, totalCount }
  })

  return NextResponse.json({
    candidates: result.rows,
    total: result.totalCount,
    limit: parsedLimit,
    offset: parsedOffset,
  })
}
