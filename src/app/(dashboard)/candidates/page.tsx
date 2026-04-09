import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { UsersIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { candidates, scores, agencies } from '@/db/schema'

export const metadata = { title: 'Candidates — SkillAI' }

export default async function CandidatesPage() {
  const session = await auth()
  const tenantId = session?.user.tenantId

  const allCandidates = tenantId
    ? await withTenant(tenantId, async (tx) =>
        tx
          .select({
            id: candidates.id,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            email: candidates.email,
            createdAt: candidates.createdAt,
            agencyName: agencies.name,
          })
          .from(candidates)
          .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
          .orderBy(desc(candidates.createdAt))
      )
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
          <p className="text-slate-500 mt-1">{allCandidates.length} candidate{allCandidates.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {allCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <UsersIcon className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">No candidates yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Upload CVs from a{' '}
            <Link href="/dashboard/roles" className="text-blue-600 hover:underline">
              role page
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Email</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Agency</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Added</th>
              </tr>
            </thead>
            <tbody>
              {allCandidates.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/candidates/${c.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{c.agencyName ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-400">
                    {new Date(c.createdAt).toLocaleDateString()}
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
