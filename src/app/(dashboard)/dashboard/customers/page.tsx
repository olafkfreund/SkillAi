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
          <h1 className="text-2xl font-bold text-zinc-100">Customers</h1>
          <p className="text-zinc-500 mt-1">
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
                        border-zinc-700 bg-zinc-950 px-6 py-16 text-center">
          <BuildingIcon className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">No customers yet</p>
          {canCreate && (
            <p className="text-zinc-500 text-sm mt-1">
              <Link href="/dashboard/customers/new" className="text-blue-400 hover:underline">
                Add your first customer
              </Link>{' '}
              to link roles to hiring organisations.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Contact name
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Contact email
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Website
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {allCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-5 py-4 font-medium text-zinc-100">{customer.name}</td>
                  <td className="px-5 py-4 text-zinc-400">
                    {customer.contactName ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-5 py-4 text-zinc-400">
                    {customer.contactEmail ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-5 py-4 text-zinc-400">
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
                      <span className="text-zinc-600">—</span>
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
