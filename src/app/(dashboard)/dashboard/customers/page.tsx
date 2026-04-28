import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { PlusIcon, BuildingIcon } from 'lucide-react'
import { withTenant } from '@/db'
import { customers } from '@/db/schema'
import { auth } from '@/lib/auth'

export const metadata = { title: 'Customers — SkillAI' }

export default async function CustomersPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const allCustomers = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({
            id: customers.id,
            name: customers.name,
            contactName: customers.contactName,
            contactEmail: customers.contactEmail,
            website: customers.website,
            isActive: customers.isActive,
            logoPath: customers.logoPath,
            createdAt: customers.createdAt,
          })
          .from(customers)
          .where(eq(customers.isActive, true))
          .orderBy(customers.name)
      )
    : []

  const canCreate = session?.user.role !== 'viewer'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Customers</h1>
          <p className="text-[var(--color-fg-subtle)] mt-1">
            {allCustomers.length} active {allCustomers.length !== 1 ? 'customers' : 'customer'}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/customers/new"
            className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                       font-medium px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            New Customer
          </Link>
        )}
      </div>

      {allCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center">
          <BuildingIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
          <p className="text-[var(--color-fg-muted)] font-medium">No customers yet</p>
          {canCreate && (
            <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
              <Link href="/dashboard/customers/new" className="text-blue-400 hover:underline">
                Add your first customer
              </Link>{' '}
              to link roles to hiring organisations.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                  Contact name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                  Contact email
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                  Website
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-[var(--color-fg-subtle)] uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {allCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-[var(--color-bg-input)]/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {/* 40px logo or initials avatar */}
                      {customer.logoPath ? (
                        <img
                          src={`/api/customers/${customer.id}/logo`}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] object-contain shrink-0"
                          style={{ width: 40, height: 40 }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center rounded-lg bg-[var(--color-bg-input)] text-[var(--color-fg-muted)]
                                     text-sm font-semibold shrink-0"
                          style={{ width: 40, height: 40 }}
                          aria-hidden="true"
                        >
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-[var(--color-fg)]">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-fg-muted)]">
                    {customer.contactName ?? <span className="text-[var(--color-fg-subtle)]">—</span>}
                  </td>
                  <td className="px-5 py-4 text-[var(--color-fg-muted)]">
                    {customer.contactEmail ?? <span className="text-[var(--color-fg-subtle)]">—</span>}
                  </td>
                  <td className="px-5 py-4 text-[var(--color-fg-muted)]">
                    {customer.website ? (
                      <a
                        href={customer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        {customer.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-[var(--color-fg-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
