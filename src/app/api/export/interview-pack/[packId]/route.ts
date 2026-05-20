import { NextResponse } from 'next/server'
import { eq, asc, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { interviewPacks, interviewQuestions, codeChallenges, candidates, roles } from '@/db/schema'
import { InterviewPackPDF } from '@/lib/pdf'
import { contentDispositionHeader } from '@/lib/http/content-disposition'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { packId } = await params

  const [pack] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(interviewPacks)
      .where(and(eq(interviewPacks.id, packId), eq(interviewPacks.tenantId, tenantId)))
      .limit(1)
  )
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (pack.generationStatus !== 'complete') {
    return NextResponse.json({ error: 'Pack is not ready yet' }, { status: 400 })
  }

  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx.select().from(candidates).where(eq(candidates.id, pack.candidateId)).limit(1)
  )
  const [role] = await withTenant(tenantId, async (tx) =>
    tx.select().from(roles).where(eq(roles.id, pack.roleId)).limit(1)
  )
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

  const candidateName = `${candidate.firstName} ${candidate.lastName}`
  const roleTitle = role?.title ?? 'Unknown Role'

  const buffer = await renderToBuffer(
    React.createElement(InterviewPackPDF, {
      pack,
      questions,
      codeChallenge: codeChallenge ?? null,
      candidateName,
      roleTitle,
    }) as any
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDispositionHeader(
        'attachment',
        `interview-pack-${candidateName}.pdf`
      ),
    },
  })
}
