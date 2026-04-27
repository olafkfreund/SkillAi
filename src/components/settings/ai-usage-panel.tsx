import { BarChart3Icon } from 'lucide-react'
import { getAiUsageSummary } from '@/actions/ai-usage'
import { AiUsageChart } from './ai-usage-chart'

/**
 * AiUsagePanel — admin-only AI usage and cost dashboard.
 * The underlying server action enforces the admin role guard, so this
 * component returns null for non-admins (i.e. is safe to render unconditionally).
 */
export async function AiUsagePanel() {
  const result = await getAiUsageSummary(30)
  if (!result.ok) {
    return null
  }
  const { summary } = result

  if (summary.totalCalls === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3Icon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-zinc-100">AI Usage & Cost</h2>
        </div>
        <p className="text-sm text-zinc-500">
          No AI usage recorded yet. Statistics will appear here once you score
          candidates or generate interview packs.
        </p>
      </section>
    )
  }

  const avgCostPerCall =
    summary.totalCalls > 0 ? summary.totalCostUsd / summary.totalCalls : 0
  const topOp = summary.byOperation[0]?.operation ?? '—'

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3Icon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-100">AI Usage & Cost</h2>
        <span className="ml-auto text-xs text-zinc-500">last 30 days</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <StatCard label="Total cost" value={`$${summary.totalCostUsd.toFixed(2)}`} />
        <StatCard label="Total calls" value={summary.totalCalls.toLocaleString()} />
        <StatCard label="Avg cost / call" value={`$${avgCostPerCall.toFixed(4)}`} />
        <StatCard label="Top operation" value={topOp} />
      </div>

      {/* Cost trend chart */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">
          Cost trend (last 30 days)
        </h3>
        <AiUsageChart data={summary.byDayLast30} />
      </div>

      {/* Operation breakdown table */}
      <div>
        <h3 className="text-sm font-medium text-zinc-300 mb-2">By operation</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-2">Operation</th>
                <th className="py-2 px-2">Model</th>
                <th className="py-2 px-2 text-right">Calls</th>
                <th className="py-2 px-2 text-right">Input tok</th>
                <th className="py-2 px-2 text-right">Output tok</th>
                <th className="py-2 pl-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.byOperation.map((row) => (
                <tr
                  key={`${row.operation}-${row.model}`}
                  className="border-b border-zinc-900"
                >
                  <td className="py-1.5 pr-2 text-zinc-200">{row.operation}</td>
                  <td className="py-1.5 px-2 text-zinc-400 text-xs">{row.model}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-300">
                    {row.calls.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-300">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-300">
                    {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="py-1.5 pl-2 text-right text-zinc-200 font-mono">
                    ${row.costUsd.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}
