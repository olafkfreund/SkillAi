import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { customers, customerFrameworks } from '@/db/schema'
import { auth } from '@/lib/auth'
import { RoleForm } from '@/components/roles/role-form'

export const metadata = { title: 'New Role — SkillAI' }

export default async function NewRolePage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const activeCustomers = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(eq(customers.isActive, true))
          .orderBy(customers.name)
      )
    : []

  // Fetch frameworks for customers that have them
  const frameworkRows = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx.select().from(customerFrameworks).where(eq(customerFrameworks.tenantId, tenantId))
      )
    : []
  const frameworks = Object.fromEntries(frameworkRows.map((f) => [f.customerId, f.levels]))

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100 mb-6">Create role</h1>
      <RoleForm customers={activeCustomers} frameworks={frameworks} />
    </div>
  )
}
