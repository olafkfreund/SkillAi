'use client'

// Usage:
// <AgencyHitRateChart data={feed.agencyHitRate} rangeDays={30} />

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ReportsFeed } from '@/actions/reports'

type Props = {
  data: ReportsFeed['agencyHitRate']
  rangeDays: number
}

type AgencyRow = ReportsFeed['agencyHitRate']['series'][number]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    payload: AgencyRow
  }>
  label?: string
}

function AgencyTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div
      style={{
        backgroundColor: '#18181b',
        border: '1px solid #3f3f46',
        borderRadius: 6,
        fontSize: 12,
        padding: '8px 12px',
        color: '#d4d4d8',
      }}
    >
      <p style={{ marginBottom: 6, fontWeight: 600 }}>{label}</p>
      <p>Submission → Hire: {row.submissionToHirePct.toFixed(1)}%</p>
      <p>Shortlist → Hire: {row.shortlistToHirePct.toFixed(1)}%</p>
      <p style={{ marginTop: 4, color: '#71717a' }}>
        Submitted: {row.candidatesSubmitted} · Shortlisted: {row.candidatesShortlisted} · Hired: {row.candidatesHired}
      </p>
    </div>
  )
}

export function AgencyHitRateChart({ data, rangeDays }: Props) {
  const rangeParam = rangeDays === 365 ? '12mo' : `${rangeDays}d`

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          Agency hit-rate
        </h2>
        <a
          href={`/api/reports/agency-hit-rate/csv?range=${rangeParam}`}
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
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data.series}
            margin={{ top: 5, right: 10, left: 0, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="agencyName"
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(v: number) => `${v}%`}
              label={{
                value: '%',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 10, fill: '#71717a' },
              }}
            />
            <Tooltip content={<AgencyTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#71717a' }}
            />
            <Bar
              dataKey="submissionToHirePct"
              name="Submission → Hire %"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="shortlistToHirePct"
              name="Shortlist → Hire %"
              fill="#10b981"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
