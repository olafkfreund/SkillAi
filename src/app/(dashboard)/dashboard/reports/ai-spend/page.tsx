import { SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAiSpendDetail } from '@/actions/reports'
import { KpiCard } from '@/components/reports/kpi-card'
import { DateRangePresets } from '@/components/reports/date-range-presets'
import { PricingCoveragePanel } from '@/components/reports/pricing-coverage-panel'
import { AiSpendByOperationTable } from '@/components/reports/ai-spend-by-operation-table'
import { AiSpendByModelChart } from '@/components/reports/ai-spend-by-model-chart'
import { AiLatencyByOperationTable } from '@/components/reports/ai-latency-by-operation-table'
import { AiDailyStackedChart } from '@/components/reports/ai-daily-stacked-chart'

export const metadata = { title: 'AI Spend — SkillAI' }

type RangeKey = '7d' | '30d' | '90d' | '12mo'

function parseRange(r: string | undefined): 7 | 30 | 90 | 365 {
  if (r === '7d') return 7
  if (r === '90d') return 90
  if (r === '12mo') return 365
  return 30
}

function toRangeKey(r: string | undefined): RangeKey {
  if (r === '7d' || r === '90d' || r === '12mo') return r
  return '30d'
}

function fmtUsd(v: number): string {
  return `$${v.toFixed(2)}`
}

function fmtMoM(pct: number | null): string {
  if (pct === null) return '—'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
}

export default async function AiSpendPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  if (session.user.role !== 'admin') {
    return (
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-medium text-[var(--color-fg)] mb-2">Admin access required</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          The AI spend dashboard is only available to admins.
        </p>
      </div>
    )
  }

  const { range } = await searchParams
  const days = parseRange(range)
  const current = toRangeKey(range)

  const data = await getAiSpendDetail({ days })

  const momAccent =
    data.kpis.monthOverMonthPct === null
      ? 'default'
      : data.kpis.monthOverMonthPct >= 0
        ? 'red'
        : 'emerald'

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--color-bg-elevated)] rounded-lg">
            <SparklesIcon className="h-5 w-5 text-[var(--color-fg-muted)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/reports"
                className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
              >
                Reports
              </Link>
              <span className="text-[var(--color-fg-subtle)] text-sm">/</span>
              <h1 className="text-xl font-bold text-[var(--color-fg)]">AI Spend</h1>
            </div>
            <p className="text-sm text-[var(--color-fg-subtle)]">
              Token usage and cost breakdown by operation and model
            </p>
          </div>
        </div>
        <DateRangePresets current={current} basePath="/dashboard/reports/ai-spend" />
      </div>

      {/* Pricing coverage warning — only shown when there are zero-cost calls */}
      <PricingCoveragePanel data={data.pricingCoverage} />

      {/* KPI grid — 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total spend"
          value={fmtUsd(data.kpis.totalUsd)}
          accent="amber"
        />
        <KpiCard
          label="Total AI calls"
          value={data.kpis.totalCalls.toLocaleString()}
        />
        <KpiCard
          label="Avg cost / call"
          value={`$${data.kpis.avgCostPerCallUsd.toFixed(4)}`}
        />
        <KpiCard
          label="Month-over-month"
          value={fmtMoM(data.kpis.monthOverMonthPct)}
          accent={momAccent}
          subtext={data.kpis.monthOverMonthPct === null ? 'insufficient data' : undefined}
        />
      </div>

      {/* Per-operation breakdown table — full width */}
      <AiSpendByOperationTable data={data.byOperation} rangeKey={current} />

      {/* Two-column at lg+: by-model chart + latency table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AiSpendByModelChart data={data.byModel} rangeKey={current} />
        <AiLatencyByOperationTable data={data.latencyByOperation} rangeKey={current} />
      </div>

      {/* Daily stacked area chart — full width */}
      <AiDailyStackedChart data={data.dailyByOperation} rangeKey={current} />
    </div>
  )
}
