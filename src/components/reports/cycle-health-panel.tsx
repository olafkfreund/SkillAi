// Usage:
// <CycleHealthPanel data={feed.cycleHealth} rangeDays={30} />

import Link from 'next/link'
import type { ReportsFeed } from '@/actions/reports'

type Props = {
  data: ReportsFeed['cycleHealth']
  rangeDays: number
}

interface TileProps {
  label: string
  value: number
  accent: 'amber' | 'red'
  href: string
}

function Tile({ label, value, accent, href }: TileProps) {
  const valueColour =
    accent === 'amber' ? 'text-amber-500' : 'text-red-500'

  return (
    <Link
      href={href}
      className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-app)] p-4
                 hover:bg-[var(--color-bg-input)] transition-colors"
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)] mb-2">
        {label}
      </p>
      <p className={`text-3xl font-semibold ${valueColour}`}>{value}</p>
    </Link>
  )
}

export function CycleHealthPanel({ data, rangeDays }: Props) {
  const rangeParam = rangeDays === 365 ? '12mo' : `${rangeDays}d`

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          Cycle health
        </h2>
        <a
          href={`/api/reports/cycle-health/csv?range=${rangeParam}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile
          label="Roles open >30 days"
          value={data.rolesOpenOver30Days}
          accent="amber"
          href="/dashboard/roles?filter=open30d"
        />
        <Tile
          label="Expired roles"
          value={data.expiredRoles}
          accent="red"
          href="/dashboard/roles?filter=expired"
        />
        <Tile
          label="Stuck in interviewing"
          value={data.candidatesStuckInterviewing}
          accent="red"
          href="/dashboard/candidates?filter=stuck"
        />
      </div>
    </div>
  )
}
