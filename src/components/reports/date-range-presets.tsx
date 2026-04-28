'use client'

import Link from 'next/link'

const RANGES = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '12mo', label: '12mo' },
] as const

export function DateRangePresets({ current }: { current: '7d' | '30d' | '90d' | '12mo' }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1">
      {RANGES.map((r) => {
        const isActive = r.key === current
        return (
          <Link
            key={r.key}
            href={`/dashboard/reports?range=${r.key}`}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              isActive
                ? 'bg-[var(--color-bg-input)] text-[var(--color-fg)]'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {r.label}
          </Link>
        )
      })}
    </div>
  )
}
