'use client'

// Usage:
// <TimeToFillChart data={feed.timeToFill} rangeDays={30} />

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { ReportsFeed } from '@/actions/reports'

type Props = {
  data: ReportsFeed['timeToFill']
  rangeDays: number
}

export function TimeToFillChart({ data, rangeDays }: Props) {
  const rangeParam = rangeDays === 365 ? '12mo' : `${rangeDays}d`

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-[var(--color-fg)]">
            Time to fill (by customer)
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
            {data.totalRolesFilled} roles filled
            {data.averageDaysOverall !== null
              ? ` · avg ${data.averageDaysOverall} days`
              : ''}
          </p>
        </div>
        <a
          href={`/api/reports/time-to-fill/csv?range=${rangeParam}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      {data.series.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-12 text-center">
          No data for this range.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data.series}
              margin={{ top: 5, right: 10, left: 0, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="customerName"
                stroke="#71717a"
                tick={{ fontSize: 10, fill: '#71717a' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                stroke="#71717a"
                tick={{ fontSize: 10, fill: '#71717a' }}
                label={{
                  value: 'Days',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#71717a' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#d4d4d8' }}
                formatter={(value, name, props) => {
                  const item = props.payload as {
                    avgDaysToFill: number
                    rolesFilled: number
                  }
                  if (name === 'avgDaysToFill') {
                    return [
                      `${value} days (${item.rolesFilled} role${item.rolesFilled === 1 ? '' : 's'} filled)`,
                      'Avg days to fill',
                    ]
                  }
                  return [String(value), String(name)]
                }}
              />
              <Bar dataKey="avgDaysToFill" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {data.hasLimitedHistoricalData && (
            <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
              Limited historical data — accuracy improves as new roles complete.
            </p>
          )}
        </>
      )}
    </div>
  )
}
