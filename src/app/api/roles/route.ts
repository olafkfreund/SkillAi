import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, users } from '@/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

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
