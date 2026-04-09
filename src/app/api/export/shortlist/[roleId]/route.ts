import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq, and, desc } from 'drizzle-orm'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { candidates, scores, roles, agencies } from '@/db/schema'
import { ShortlistPDF } from '@/lib/pdf'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { roleId } = await params

  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const candidateScores = await withTenant(tenantId, async (tx) =>
    tx
      .select({ candidate: candidates, score: scores })
      .from(scores)
      .innerJoin(candidates, eq(scores.candidateId, candidates.id))
      .where(and(eq(scores.roleId, roleId), eq(scores.scoreStatus, 'complete')))
      .orderBy(desc(scores.overallScore))
  )

  const agencyIds = [...new Set(candidateScores.map((r) => r.candidate.agencyId).filter(Boolean))] as string[]

  const agencyMap = new Map<string, string>()
  if (agencyIds.length > 0) {
    const agencyRows = await withTenant(tenantId, async (tx) =>
      tx.select({ id: agencies.id, name: agencies.name }).from(agencies)
    )
    for (const a of agencyRows) agencyMap.set(a.id, a.name)
  }

  const entries = candidateScores.map(({ candidate, score }) => ({
    candidate,
    score,
    agencyName: candidate.agencyId ? (agencyMap.get(candidate.agencyId) ?? null) : null,
  }))

  const buffer = await renderToBuffer(
    React.createElement(ShortlistPDF, { entries, roleTitle: role.title }) as any
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="shortlist-${role.title.replace(/\s+/g, '-')}.pdf"`,
    },
  })
}
