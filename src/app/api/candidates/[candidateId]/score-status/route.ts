import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { scores } from '@/db/schema'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { candidateId } = await params
  const { searchParams } = new URL(request.url)
  const roleId = searchParams.get('roleId')
  if (!roleId) return NextResponse.json({ error: 'roleId required' }, { status: 400 })

  const [score] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ status: scores.scoreStatus, overallScore: scores.overallScore })
      .from(scores)
      .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
      .limit(1)
  )

  if (!score) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(score)
}
