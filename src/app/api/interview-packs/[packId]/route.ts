import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq, asc } from 'drizzle-orm'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions, codeChallenges } from '@/db/schema'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { packId } = await params

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx.select().from(interviewPacks).where(eq(interviewPacks.id, packId)).limit(1)
  )
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (pack.generationStatus === 'pending' || pack.generationStatus === 'processing') {
    return NextResponse.json({ pack, questions: [], codeChallenge: null })
  }

  const questions = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.packId, packId))
      .orderBy(asc(interviewQuestions.orderIndex))
  )

  const [codeChallenge] = await withTenant(tenantId, async (tx) =>
    tx.select().from(codeChallenges).where(eq(codeChallenges.packId, packId)).limit(1)
  )

  return NextResponse.json({ pack, questions, codeChallenge: codeChallenge ?? null })
}
