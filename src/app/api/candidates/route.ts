import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { desc, eq, and, gte, count } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'

export async function GET(request: Request) {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const roleId = searchParams.get('roleId')
  const minScore = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : undefined

  // Pagination params — limit capped at 200, default 50
  const parsedLimit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? 50)), 200)
  const parsedOffset = Math.max(0, Number(searchParams.get('offset') ?? 0))

  const result = await withTenant(tenantId, async (tx) => {
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
      .leftJoin(
        scores,
        and(
          eq(scores.candidateId, candidates.id),
          roleId ? eq(scores.roleId, roleId) : undefined
        )
      )
      .orderBy(desc(scores.overallScore), desc(candidates.createdAt))
      .limit(parsedLimit)
      .offset(parsedOffset)

    const [{ value: totalCount }] = await tx
      .select({ value: count() })
      .from(candidates)

    return { rows, totalCount }
  })

  const filtered =
    minScore !== undefined
      ? result.rows.filter((r) => r.overallScore !== null && r.overallScore >= minScore)
      : result.rows

  return NextResponse.json({
    candidates: filtered,
    total: result.totalCount,
    limit: parsedLimit,
    offset: parsedOffset,
  })
}
