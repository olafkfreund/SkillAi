import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { cvProfiles } from '@/db/schema'

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

  const [profile] = await withTenant(tenantId, async (tx) =>
    tx.select().from(cvProfiles).where(eq(cvProfiles.candidateId, candidateId)).limit(1)
  )

  if (!profile) {
    return NextResponse.json(null)
  }

  return NextResponse.json({
    experienceLevel: profile.experienceLevel,
    summary: profile.summary,
    technicalSkills: profile.technicalSkills ?? [],
    companies: profile.companies ?? [],
    personalizableMoments: profile.personalizableMoments ?? [],
    extractionStatus: profile.extractionStatus,
    errorMessage: profile.errorMessage,
    extractedAt: profile.extractedAt,
  })
}
