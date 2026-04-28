// Usage:
// <KpiCard label="Active Roles" value={42} />
// <KpiCard label="AI Spend" value="$12.50" subtext="last 30 days" accent="amber" />

type Props = {
  label: string
  value: string | number
  subtext?: string
  accent?: 'default' | 'emerald' | 'red' | 'amber'
}

const accentClass: Record<NonNullable<Props['accent']>, string> = {
  default: 'text-[var(--color-fg)]',
  emerald: 'text-emerald-500',
  red: 'text-red-500',
  amber: 'text-amber-500',
}

export function KpiCard({ label, value, subtext, accent = 'default' }: Props) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <p className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)] mb-2">
        {label}
      </p>
      <p className={`text-3xl font-semibold ${accentClass[accent]}`}>
        {value}
      </p>
      {subtext && (
        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{subtext}</p>
      )}
    </div>
  )
}
