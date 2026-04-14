import { NextResponse } from 'next/server'
import { eq, desc, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions, roles } from '@/db/schema'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { candidateId } = await params

  const packs = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: interviewPacks.id,
        generationStatus: interviewPacks.generationStatus,
        generationStage: interviewPacks.generationStage,
        experienceLevel: interviewPacks.experienceLevel,
        recommendedDurationMinutes: interviewPacks.recommendedDurationMinutes,
        includesCodeChallenge: interviewPacks.includesCodeChallenge,
        packType: interviewPacks.packType,
        createdAt: interviewPacks.createdAt,
        updatedAt: interviewPacks.updatedAt,
        roleTitle: roles.title,
        roleId: interviewPacks.roleId,
        questionCount: count(interviewQuestions.id),
      })
      .from(interviewPacks)
      .leftJoin(roles, eq(interviewPacks.roleId, roles.id))
      .leftJoin(interviewQuestions, eq(interviewQuestions.packId, interviewPacks.id))
      .where(eq(interviewPacks.candidateId, candidateId))
      .groupBy(interviewPacks.id, roles.title, interviewPacks.updatedAt)
      .orderBy(desc(interviewPacks.createdAt))
  )

  return NextResponse.json(packs)
}
