'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import type { AiSpendDetail } from '@/actions/reports'

type Props = {
  data: AiSpendDetail['byModel']
  rangeKey: '7d' | '30d' | '90d' | '12mo'
}

type ModelRow = AiSpendDetail['byModel'][number]

const BAR_COLOURS = [
  '#fbbf24',
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#94a3b8',
]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: ModelRow }>
  label?: string
}

function ModelTooltip({ active, payload, label }: CustomTooltipProps) {
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
      <p style={{ marginBottom: 4, fontWeight: 600 }}>{label}</p>
      <p>Total: ${row.totalUsd.toFixed(4)}</p>
      <p>Calls: {row.calls.toLocaleString()}</p>
      <p>Share: {row.sharePct.toFixed(1)}%</p>
    </div>
  )
}

export function AiSpendByModelChart({ data, rangeKey }: Props) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          By model
        </h2>
        <a
          href={`/api/reports/ai-spend-by-model/csv?range=${rangeKey}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-12 text-center">
          No data for this range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 48)}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 80, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
            <XAxis
              type="number"
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <YAxis
              type="category"
              dataKey="model"
              stroke="#71717a"
              tick={{ fontSize: 10, fill: '#71717a' }}
              width={160}
            />
            <Tooltip content={<ModelTooltip />} />
            <Bar dataKey="totalUsd" radius={[0, 3, 3, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={entry.model}
                  fill={BAR_COLOURS[index % BAR_COLOURS.length]}
                />
              ))}
              <LabelList
                dataKey="sharePct"
                position="right"
                formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v}%`}
                style={{ fontSize: 10, fill: '#71717a' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
