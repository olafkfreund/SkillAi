import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roles, users } from '@/db/schema'

export async function GET() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')

  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: roles.id,
        title: roles.title,
        description: roles.description,
        requirements: roles.requirements,
        isActive: roles.isActive,
        createdAt: roles.createdAt,
        createdByName: users.name,
      })
      .from(roles)
      .leftJoin(users, eq(roles.createdBy, users.id))
      .where(eq(roles.isActive, true))
      .orderBy(desc(roles.createdAt))
  })

  return NextResponse.json(result)
}
