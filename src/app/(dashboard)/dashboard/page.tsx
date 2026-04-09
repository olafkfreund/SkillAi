import { auth } from '@/lib/auth'

export const metadata = { title: 'Dashboard — SkillAI' }

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Dashboard</h1>
      <p className="text-slate-500">
        Welcome back, <span className="font-medium text-slate-700">{session?.user.name}</span>.
      </p>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Stat cards — populated in Task 8 */}
        {['Active Roles', 'Candidates', 'Pending Scores'].map((label) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 px-6 py-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">—</p>
          </div>
        ))}
      </div>
    </div>
  )
}
