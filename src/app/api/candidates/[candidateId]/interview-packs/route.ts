import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq, desc, count } from 'drizzle-orm'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions, roles } from '@/db/schema'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { candidateId } = await params

  const packs = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: interviewPacks.id,
        generationStatus: interviewPacks.generationStatus,
        experienceLevel: interviewPacks.experienceLevel,
        recommendedDurationMinutes: interviewPacks.recommendedDurationMinutes,
        includesCodeChallenge: interviewPacks.includesCodeChallenge,
        createdAt: interviewPacks.createdAt,
        roleTitle: roles.title,
        roleId: interviewPacks.roleId,
        questionCount: count(interviewQuestions.id),
      })
      .from(interviewPacks)
      .leftJoin(roles, eq(interviewPacks.roleId, roles.id))
      .leftJoin(interviewQuestions, eq(interviewQuestions.packId, interviewPacks.id))
      .where(eq(interviewPacks.candidateId, candidateId))
      .groupBy(interviewPacks.id, roles.title)
      .orderBy(desc(interviewPacks.createdAt))
  )

  return NextResponse.json(packs)
}
