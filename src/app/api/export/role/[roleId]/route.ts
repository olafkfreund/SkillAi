import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { withTenant } from '@/db'
import { roles, customers } from '@/db/schema'
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
    React.createElement(RolePDF, {
      role,
      customerName,
      customerRoleId: role.customerRoleId,
      customerRoleIdLabel,
    }) as any
  )

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="role-${role.title.replace(/\s+/g, '-')}.pdf"`,
    },
  })
}
