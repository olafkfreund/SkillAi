import type { AiSpendDetail } from '@/actions/reports'

type Props = {
  data: AiSpendDetail['byOperation']
  rangeKey: '7d' | '30d' | '90d' | '12mo'
}

function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function AiSpendByOperationTable({ data, rangeKey }: Props) {
  const sorted = [...data].sort((a, b) => b.totalUsd - a.totalUsd)

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          By operation
        </h2>
        <a
          href={`/api/reports/ai-spend-by-operation/csv?range=${rangeKey}`}
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
                <th className="py-2 pr-3 font-normal text-right">Calls</th>
                <th className="py-2 pr-3 font-normal text-right">Total</th>
                <th className="py-2 pr-3 font-normal text-right">Avg/call</th>
                <th className="py-2 pr-3 font-normal text-right">Input tokens</th>
                <th className="py-2 pr-3 font-normal text-right">Output tokens</th>
                <th className="py-2 pr-3 font-normal text-right">Cache create</th>
                <th className="py-2 pr-3 font-normal text-right">Cache read</th>
                <th className="py-2 font-normal text-right">Last call</th>
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
                    {row.calls.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-[var(--color-fg)]">
                    ${row.totalUsd.toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    ${row.avgCostPerCallUsd.toFixed(4)}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {row.cacheCreationTokens.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-fg-muted)]">
                    {row.cacheReadTokens.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-[var(--color-fg-subtle)]">
                    {row.lastCallAt ? timeAgo(row.lastCallAt) : '—'}
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
