import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { withTenant } from '@/db'
import { customers, roles } from '@/db/schema'
import { auth } from '@/lib/auth'
import { CustomerEditForm } from '@/components/customers/customer-edit-form'
import { FrameworkEditor } from '@/components/customers/framework-editor'
import { getCustomerFramework } from '@/actions/frameworks'

export const metadata = { title: 'Customer — SkillAI' }

interface Props {
  params: Promise<{ customerId: string }>
}

export default async function CustomerDetailPage({ params }: Props) {
  const { customerId } = await params
  const session = await auth()
  const tenantId = session?.user.tenantId
  if (!tenantId) notFound()

  const [customer] = await withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1)
  )

  if (!customer) notFound()

  const customerRoles = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: roles.id,
        title: roles.title,
        isActive: roles.isActive,
        createdAt: roles.createdAt,
      })
      .from(roles)
      .where(
        and(
          eq(roles.customerId, customerId),
          eq(roles.tenantId, tenantId),
          eq(roles.isActive, true)
        )
      )
      .orderBy(roles.createdAt)
  )

  const canEdit = session?.user.role !== 'viewer'
  const isAdmin = session?.user.role === 'admin'

  const framework = await getCustomerFramework(customerId, tenantId)

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/customers" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to customers
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-2">{customer.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details / Edit */}
        <div className="lg:col-span-1">
          {canEdit ? (
            <CustomerEditForm customer={customer} isAdmin={isAdmin} />
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
              {customer.contactName && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Contact</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{customer.contactName}</p>
                </div>
              )}
              {customer.contactEmail && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{customer.contactEmail}</p>
                </div>
              )}
              {customer.contactPhone && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Phone</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{customer.contactPhone}</p>
                </div>
              )}
              {customer.website && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Website</p>
                  <a
                    href={customer.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline mt-0.5 block"
                  >
                    {customer.website}
                  </a>
                </div>
              )}
              {customer.portalBaseUrl && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Portal Base URL</p>
                  <a
                    href={customer.portalBaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-400 hover:underline mt-0.5 block"
                  >
                    {customer.portalBaseUrl}
                  </a>
                </div>
              )}
              {customer.notes && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hiring Framework + Active Roles */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">Hiring Framework</h2>
            <FrameworkEditor
              customerId={customerId}
              existingFramework={
                framework
                  ? { name: framework.name, description: framework.description, levels: framework.levels }
                  : null
              }
              isAdmin={isAdmin}
            />
          </div>

          {/* Active roles for this customer */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">
              Active roles ({customerRoles.length})
            </h2>
            {customerRoles.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 px-6 py-10 text-center">
                <p className="text-zinc-500 text-sm">No active roles linked to this customer yet.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {customerRoles.map((role) => (
                  <Link
                    key={role.id}
                    href={`/dashboard/roles/${role.id}`}
                    className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-700
                               px-5 py-3 hover:border-blue-500 hover:shadow-sm transition-all"
                  >
                    <span className="text-sm font-medium text-zinc-100">{role.title}</span>
                    <time className="text-xs text-zinc-500">
                      {new Date(role.createdAt).toLocaleDateString()}
                    </time>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
