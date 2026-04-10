import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { candidates, scores, roles, agencies } from '@/db/schema'
import { CandidatePDF } from '@/lib/pdf'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const { candidateId } = await params
  const { searchParams } = new URL(req.url)
  const roleId = searchParams.get('roleId')

  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [agency] = candidate.agencyId
    ? await withTenant(tenantId, async (tx) =>
        tx.select().from(agencies).where(eq(agencies.id, candidate.agencyId!)).limit(1)
      )
    : [null]

  let score = null
  let role = null

  if (roleId) {
    const [scoreRow] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(scores)
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
        .limit(1)
    )
    score = scoreRow ?? null

    if (score) {
      const [roleRow] = await withTenant(tenantId, async (tx) =>
        tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
      )
      role = roleRow ?? null
    }
  }

  const buffer = await renderToBuffer(
    React.createElement(CandidatePDF, {
      candidate,
      score,
      role,
      agencyName: agency?.name ?? null,
    }) as any
  )

  const filename = `${candidate.firstName}-${candidate.lastName}-profile.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
