import type { AiSpendDetail } from '@/actions/reports'

type Props = {
  data: AiSpendDetail['latencyByOperation']
  rangeKey: '7d' | '30d' | '90d' | '12mo'
}

function fmtMs(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString()
}

export function AiLatencyByOperationTable({ data, rangeKey }: Props) {
  // Operations with all-null latency sink to the bottom
  const sorted = [...data].sort((a, b) => {
    if (a.p95Ms === null && b.p95Ms === null) return 0
    if (a.p95Ms === null) return 1
    if (b.p95Ms === null) return -1
    return b.p95Ms - a.p95Ms
  })

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          Latency by operation
        </h2>
        <a
          href={`/api/reports/ai-latency-by-operation/csv?range=${rangeKey}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-12 text-center">
          No data for this range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-fg-subtle)] border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 font-normal">Operation</th>
                <th className="py-2 pr-3 font-normal text-right">Samples</th>
                <th className="py-2 pr-3 font-normal text-right">p50 ms</th>
                <th className="py-2 pr-3 font-normal text-right">p95 ms</th>
                <th className="py-2 pr-3 font-normal text-right">Avg ms</th>
                <th className="py-2 font-normal text-right">Max ms</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.operation}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="py-2 pr-3 font-mono text-xs text-[var(--color-fg)]">
                    {row.operation}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {row.samples.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {fmtMs(row.p50Ms)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-[var(--color-fg)]">
                    {fmtMs(row.p95Ms)}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {fmtMs(row.avgMs)}
                  </td>
                  <td className="py-2 text-right text-[var(--color-fg-muted)]">
                    {fmtMs(row.maxMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
