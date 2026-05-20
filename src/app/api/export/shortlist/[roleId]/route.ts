import { NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { candidates, scores, roles, agencies, customers } from '@/db/schema'
import { ShortlistPDF } from '@/lib/pdf'
import { contentDispositionHeader } from '@/lib/http/content-disposition'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

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
      .limit(100)
  )

  const agencyIds = [...new Set(candidateScores.map((r) => r.candidate.agencyId).filter(Boolean))] as string[]

  const agencyMap = new Map<string, string>()
  if (agencyIds.length > 0) {
    const agencyRows = await withTenant(tenantId, async (tx) =>
      tx.select({ id: agencies.id, name: agencies.name }).from(agencies)
    )
    for (const a of agencyRows) agencyMap.set(a.id, a.name)
  }

  const entries = candidateScores.map(({ candidate, score }) => {
    let margin: { amount: number; currency: string; mismatch: boolean } | null = null
    if (role.customerDayRate && candidate.candidateRate) {
      const mismatch = Boolean(
        role.rateCurrency && candidate.rateCurrency && role.rateCurrency !== candidate.rateCurrency
      )
      margin = {
        amount: Number(role.customerDayRate) - Number(candidate.candidateRate),
        currency: role.rateCurrency ?? candidate.rateCurrency ?? '',
        mismatch,
      }
    }
    return {
      candidate,
      score,
      agencyName: candidate.agencyId ? (agencyMap.get(candidate.agencyId) ?? null) : null,
      margin,
    }
  })

  // Look up customer name + per-customer role ID label if linked
  let customerName: string | null = null
  let customerRoleIdLabel: string | null = null
  if (role.customerId) {
    const [customer] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ name: customers.name, roleIdLabel: customers.roleIdLabel })
        .from(customers)
        .where(eq(customers.id, role.customerId!))
        .limit(1)
    )
    customerName = customer?.name ?? null
    customerRoleIdLabel = customer?.roleIdLabel ?? null
  }

  const buffer = await renderToBuffer(
    React.createElement(ShortlistPDF, {
      entries,
      roleTitle: role.title,
      role,
      customerName,
      customerRoleId: role.customerRoleId,
      customerRoleIdLabel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf renderToBuffer expects any-typed element
    }) as any
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDispositionHeader('inline', `shortlist-${role.title}.pdf`),
    },
  })
}
