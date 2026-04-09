import { auth } from '@/lib/auth'

export const metadata = { title: 'Dashboard — SkillAI' }

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100 mb-2">Dashboard</h1>
      <p className="text-zinc-500">
        Welcome back, <span className="font-medium text-zinc-300">{session?.user.name}</span>.
      </p>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Stat cards — populated in Task 8 */}
        {['Active Roles', 'Candidates', 'Pending Scores'].map((label) => (
          <div
            key={label}
            className="bg-zinc-900 rounded-xl border border-zinc-700 px-6 py-5"
          >
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="text-3xl font-bold text-zinc-100 mt-1">—</p>
          </div>
        ))}
      </div>
    </div>
  )
}
