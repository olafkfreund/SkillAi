import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { desc, eq, and, gte } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'

export async function GET(request: Request) {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const roleId = searchParams.get('roleId')
  const minScore = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : undefined

  const result = await withTenant(tenantId, async (tx) => {
    let query = tx
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

    return query
  })

  const filtered =
    minScore !== undefined
      ? result.filter((r) => r.overallScore !== null && r.overallScore >= minScore)
      : result

  return NextResponse.json(filtered)
}
