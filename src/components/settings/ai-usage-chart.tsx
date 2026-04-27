'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

interface DayPoint {
  date: string
  costUsd: number
  calls: number
}

export function AiUsageChart({ data }: { data: DayPoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-zinc-500">No data.</p>
  }
  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            stroke="#71717a"
            tick={{ fontSize: 10 }}
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
            formatter={(value) => {
              const num = typeof value === 'number' ? value : Number(value)
              return `$${num.toFixed(4)}`
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
    </div>
  )
}
