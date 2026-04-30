'use client'

import Link from 'next/link'

export type FrameworkLevelOption = {
  id: string
  code: string
  title: string
  description: string
  order: number
}

type Props = {
  customerId: string
  levels: FrameworkLevelOption[]
  value: { id: string; label: string }
  onChange: (next: { id: string; label: string }) => void
  disabled?: boolean
}

// Three render states:
// 1. No customer selected → render nothing (frameworks are customer-scoped)
// 2. Customer has framework levels → dropdown (the original behaviour)
// 3. Customer has no framework yet → empty state + link to configure.
//    Sub-case: a stale `value.label` may exist on the role (the customer's
//    framework was deleted after the role was set). Surface it with a Clear
//    button so it can be removed.
export function FrameworkLevelField({
  customerId,
  levels,
  value,
  onChange,
  disabled = false,
}: Props) {
  if (!customerId) return null

  const sortedLevels = [...levels].sort((a, b) => a.order - b.order)
  const selected = sortedLevels.find((l) => l.id === value.id)

  if (sortedLevels.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Framework Level <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-3 text-sm text-zinc-400">
          {value.label ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-zinc-300">
                  Current value: <span className="font-medium">{value.label}</span>
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  This level is no longer in the customer&apos;s framework.{' '}
                  <Link
                    href={`/dashboard/customers/${customerId}`}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Configure framework →
                  </Link>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ id: '', label: '' })}
                disabled={disabled}
                className="rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300
                           hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                Clear
              </button>
            </div>
          ) : (
            <p>
              This customer doesn&apos;t have a band framework yet.{' '}
              <Link
                href={`/dashboard/customers/${customerId}`}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Configure framework →
              </Link>
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="frameworkLevelId" className="block text-sm font-medium text-zinc-300 mb-1">
        Framework Level <span className="text-zinc-500 font-normal">(optional)</span>
      </label>
      <select
        id="frameworkLevelId"
        name="frameworkLevelId"
        disabled={disabled}
        value={value.id}
        onChange={(e) => {
          const level = sortedLevels.find((l) => l.id === e.target.value)
          onChange({
            id: e.target.value,
            label: level ? `${level.code} — ${level.title}` : '',
          })
        }}
        className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:opacity-50"
      >
        <option value="">Select band level…</option>
        {sortedLevels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.code} — {level.title}
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-xs text-zinc-500 mt-1">{selected.description}</p>
      )}
    </div>
  )
}
