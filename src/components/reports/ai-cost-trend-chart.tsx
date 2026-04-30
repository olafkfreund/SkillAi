'use client'

// Usage:
// <AiCostTrendChart data={feed.aiCostTrend} rangeDays={30} />

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { ReportsFeed } from '@/actions/reports'

type Props = {
  data: ReportsFeed['aiCostTrend']
  rangeDays: number
}

export function AiCostTrendChart({ data, rangeDays }: Props) {
  const rangeParam = rangeDays === 365 ? '12mo' : `${rangeDays}d`

  const momPct = data.monthOverMonthPct
  const momDisplay =
    momPct !== null
      ? `${momPct >= 0 ? '+' : ''}${momPct.toFixed(0)}%`
      : null
  const momColour =
    momPct !== null && momPct >= 0 ? 'text-red-500' : 'text-emerald-500'

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          AI cost trend
        </h2>
        <div className="flex items-center gap-3">
          {momDisplay && (
            <span className={`text-xs font-medium ${momColour}`}>
              {momDisplay} MoM
            </span>
          )}
          <span className="text-xs text-[var(--color-fg-muted)]">
            Total ${data.totalUsd.toFixed(2)}
          </span>
          <a
            href={`/dashboard/reports/ai-spend?range=${rangeParam}`}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
          >
            View breakdown →
          </a>
          <a
            href={`/api/reports/ai-cost-trend/csv?range=${rangeParam}`}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
          >
            Export CSV
          </a>
        </div>
      </div>

      {data.series.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-12 text-center">
          No data for this range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data.series}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: '#d4d4d8' }}
              formatter={(value, name) => {
                const num = typeof value === 'number' ? value : Number(value)
                if (name === 'costUsd') return [`$${num.toFixed(4)}`, 'Cost']
                if (name === 'calls') return [num.toLocaleString('en-GB'), 'API calls']
                return [String(value), String(name)]
              }}
            />
            <Line
              type="monotone"
              dataKey="costUsd"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
