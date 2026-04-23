import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { ArrowLeftIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { roles, customers, customerFrameworks } from '@/db/schema'
import { RoleEditForm } from '@/components/roles/role-edit-form'

type Props = { params: Promise<{ roleId: string }> }

export default async function RoleEditPage({ params }: Props) {
  const { roleId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [role] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1)
  )
  if (!role) notFound()

  const activeCustomers = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.isActive, true)))
  )

  // Fetch frameworks for customers that have them
  const frameworkRows = await withTenant(tenantId, async (tx) =>
    tx.select().from(customerFrameworks).where(eq(customerFrameworks.tenantId, tenantId))
  )
  const frameworks = Object.fromEntries(frameworkRows.map((f) => [f.customerId, f.levels]))

  return (
    <div>
      <Link
        href={`/dashboard/roles/${roleId}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to role
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Edit role</h1>
        <p className="text-zinc-500 mt-1 text-sm">{role.title}</p>
      </div>

      <RoleEditForm
        role={{
          id: role.id,
          title: role.title,
          description: role.description,
          requirements: role.requirements,
          customerId: role.customerId,
          frameworkLevelId: role.frameworkLevelId,
          frameworkLevelLabel: role.frameworkLevelLabel,
          targetFillDate: role.targetFillDate,
          cutoffDate: role.cutoffDate,
          customerPortalPath: role.customerPortalPath,
          customerDayRate: role.customerDayRate,
          rateCurrency: role.rateCurrency,
        }}
        customers={activeCustomers}
        frameworks={frameworks}
      />
    </div>
  )
}
