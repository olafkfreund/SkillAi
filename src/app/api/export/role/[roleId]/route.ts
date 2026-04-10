import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { roles } from '@/db/schema'
import { RolePDF } from '@/lib/pdf'

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

  const buffer = await renderToBuffer(React.createElement(RolePDF, { role }) as any)

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="role-${role.title.replace(/\s+/g, '-')}.pdf"`,
    },
  })
}
