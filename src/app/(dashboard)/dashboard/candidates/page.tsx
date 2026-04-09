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
          <h1 className="text-2xl font-bold text-zinc-100">Candidates</h1>
          <p className="text-zinc-500 mt-1">{allCandidates.length} candidate{allCandidates.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {allCandidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                        border-zinc-700 bg-zinc-950 px-6 py-16 text-center">
          <UsersIcon className="h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">No candidates yet</p>
          <p className="text-zinc-500 text-sm mt-1">
            Upload CVs from a{' '}
            <Link href="/dashboard/roles" className="text-blue-400 hover:underline">
              role page
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800">
                <th className="text-left px-5 py-3 font-medium text-zinc-400">Name</th>
                <th className="text-left px-5 py-3 font-medium text-zinc-400">Email</th>
                <th className="text-left px-5 py-3 font-medium text-zinc-400">Agency</th>
                <th className="text-left px-5 py-3 font-medium text-zinc-400">Added</th>
              </tr>
            </thead>
            <tbody>
              {allCandidates.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-700 hover:bg-zinc-800 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/candidates/${c.id}`}
                      className="font-medium text-zinc-100 hover:text-blue-400"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-500">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-zinc-500">{c.agencyName ?? '—'}</td>
                  <td className="px-5 py-3 text-zinc-500">
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
