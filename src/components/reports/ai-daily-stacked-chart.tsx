'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { AiSpendDetail } from '@/actions/reports'

type Props = {
  data: AiSpendDetail['dailyByOperation']
  rangeKey: '7d' | '30d' | '90d' | '12mo'
}

const PALETTE = [
  '#fbbf24',
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#94a3b8', // "other" always last
]

const MAX_OPERATIONS = 8

type WideRow = Record<string, number | string>

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; fill: string }>
  label?: string
  operations: string[]
}

function DailyTooltip({ active, payload, label, operations }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  // Show operations in consistent order (same as area stacking order), non-zero first
  const entries = operations
    .map((op) => {
      const item = payload.find((p) => p.name === op)
      return { op, value: item?.value ?? 0, fill: item?.fill ?? '#94a3b8' }
    })
    .filter((e) => e.value > 0)

  if (entries.length === 0) return null

  return (
    <div
      style={{
        backgroundColor: '#18181b',
        border: '1px solid #3f3f46',
        borderRadius: 6,
        fontSize: 12,
        padding: '8px 12px',
        color: '#d4d4d8',
        maxWidth: 260,
      }}
    >
      <p style={{ marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {entries.map(({ op, value, fill }) => (
        <p key={op} style={{ color: fill, marginBottom: 2 }}>
          {op}: ${value.toFixed(4)}
        </p>
      ))}
    </div>
  )
}

function pivotData(
  raw: AiSpendDetail['dailyByOperation'],
  topOps: string[]
): WideRow[] {
  // Collect all dates, sorted ascending
  const dateSet = new Set<string>()
  for (const row of raw) dateSet.add(row.date)
  const dates = Array.from(dateSet).sort()

  // Build a lookup: date → operation → costUsd
  const lookup = new Map<string, Map<string, number>>()
  for (const row of raw) {
    if (!lookup.has(row.date)) lookup.set(row.date, new Map())
    const opKey = topOps.includes(row.operation) ? row.operation : 'other'
    const existing = lookup.get(row.date)!
    existing.set(opKey, (existing.get(opKey) ?? 0) + row.costUsd)
  }

  const allKeys = [...topOps, 'other']

  return dates.map((date) => {
    const opMap = lookup.get(date) ?? new Map<string, number>()
    const wide: WideRow = { date: date.slice(5) } // MM-DD display
    for (const key of allKeys) {
      wide[key] = opMap.get(key) ?? 0
    }
    return wide
  })
}

export function AiDailyStackedChart({ data, rangeKey }: Props) {
  // Determine top-8 operations by total cost across the range
  const totalsMap = new Map<string, number>()
  for (const row of data) {
    totalsMap.set(row.operation, (totalsMap.get(row.operation) ?? 0) + row.costUsd)
  }
  const sortedOps = Array.from(totalsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([op]) => op)

  const topOps = sortedOps.slice(0, MAX_OPERATIONS)
  const hasOther = sortedOps.length > MAX_OPERATIONS
  const stackKeys = hasOther ? [...topOps, 'other'] : topOps

  const chartData = pivotData(data, topOps)

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          Daily cost by operation
        </h2>
        <a
          href={`/api/reports/ai-cost-trend/csv?range=${rangeKey}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-12 text-center">
          No data for this range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              content={
                <DailyTooltip operations={stackKeys} />
              }
            />
            {stackKeys.map((op, index) => {
              const colour = PALETTE[index % PALETTE.length]
              return (
                <Area
                  key={op}
                  type="monotone"
                  dataKey={op}
                  name={op}
                  stackId="1"
                  stroke={colour}
                  fill={colour}
                  fillOpacity={0.7}
                  dot={false}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Legend — outside Recharts to keep it readable */}
      {stackKeys.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {stackKeys.map((op, index) => (
            <div key={op} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
              />
              <span className="text-xs text-[var(--color-fg-muted)] font-mono">{op}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
