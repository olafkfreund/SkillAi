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
        <Link href="/dashboard/customers" className="text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]">
          ← Back to customers
        </Link>
        <div className="flex items-center gap-4 mt-2">
          {/* 64px logo or initials avatar */}
          {customer.logoPath ? (
            <img
              src={`/api/customers/${customer.id}/logo`}
              alt=""
              width={64}
              height={64}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] object-contain shrink-0"
              style={{ width: 64, height: 64 }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-xl bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]
                         text-xl font-semibold shrink-0"
              style={{ width: 64, height: 64 }}
              aria-hidden="true"
            >
              {customer.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">{customer.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details / Edit */}
        <div className="lg:col-span-1">
          {canEdit ? (
            <CustomerEditForm customer={customer} isAdmin={isAdmin} />
          ) : (
            <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
              {customer.contactName && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Contact</p>
                  <p className="text-sm text-[var(--color-fg)] mt-0.5">{customer.contactName}</p>
                </div>
              )}
              {customer.contactEmail && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Email</p>
                  <p className="text-sm text-[var(--color-fg)] mt-0.5">{customer.contactEmail}</p>
                </div>
              )}
              {customer.contactPhone && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Phone</p>
                  <p className="text-sm text-[var(--color-fg)] mt-0.5">{customer.contactPhone}</p>
                </div>
              )}
              {customer.website && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Website</p>
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
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Portal Base URL</p>
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
                  <p className="text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-[var(--color-fg)] mt-0.5 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hiring Framework + Active Roles */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-fg)] mb-4">Hiring Framework</h2>
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
            <h2 className="text-lg font-semibold text-[var(--color-fg)] mb-3">
              Active roles ({customerRoles.length})
            </h2>
            {customerRoles.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-10 text-center">
                <p className="text-[var(--color-fg-subtle)] text-sm">No active roles linked to this customer yet.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {customerRoles.map((role) => (
                  <Link
                    key={role.id}
                    href={`/dashboard/roles/${role.id}`}
                    className="flex items-center justify-between rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
                               px-5 py-3 hover:border-blue-500 hover:shadow-sm transition-all"
                  >
                    <span className="text-sm font-medium text-[var(--color-fg)]">{role.title}</span>
                    <time className="text-xs text-[var(--color-fg-subtle)]">
                      {new Date(role.createdAt).toLocaleDateString('en-GB')}
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
