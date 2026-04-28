import { BarChart3Icon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getReportsFeed, type ReportsFeed } from '@/actions/reports'
import { KpiCard } from '@/components/reports/kpi-card'
import { TimeToFillChart } from '@/components/reports/time-to-fill-chart'
import { AgencyHitRateChart } from '@/components/reports/agency-hit-rate-chart'
import { AiCostTrendChart } from '@/components/reports/ai-cost-trend-chart'
import { CycleHealthPanel } from '@/components/reports/cycle-health-panel'
import { TopPerformersTables } from '@/components/reports/top-performers-tables'
import { DateRangePresets } from '@/components/reports/date-range-presets'

export const metadata = { title: 'Reports — SkillAI' }

type ReportRange = '7d' | '30d' | '90d' | '12mo'

function parseRange(r: string | undefined): 7 | 30 | 90 | 365 {
  if (r === '7d') return 7
  if (r === '90d') return 90
  if (r === '12mo') return 365
  return 30
}

function toRangeKey(r: string | undefined): ReportRange {
  if (r === '7d' || r === '90d' || r === '12mo') return r
  return '30d'
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const { range } = await searchParams
  const days = parseRange(range)
  const current = toRangeKey(range)

  if (session.user.role !== 'admin') {
    return (
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-medium text-[var(--color-fg)] mb-2">Admin access required</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          The reports dashboard is only available to admins.
        </p>
      </div>
    )
  }

  const feed: ReportsFeed = await getReportsFeed({ days })

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--color-bg-elevated)] rounded-lg">
            <BarChart3Icon className="h-5 w-5 text-[var(--color-fg-muted)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-fg)]">Reports</h1>
            <p className="text-sm text-[var(--color-fg-subtle)]">
              Recruiting performance and pipeline health
            </p>
          </div>
        </div>
        <DateRangePresets current={current} />
      </div>

      {/* KPI grid — 5 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Active roles" value={feed.kpis.activeRoles} />
        <KpiCard label="New candidates" value={feed.kpis.candidatesAddedInRange} />
        <KpiCard label="Scored" value={feed.kpis.candidatesScoredInRange} />
        <KpiCard label="Hires" value={feed.kpis.candidatesHiredInRange} />
        <KpiCard
          label="AI spend ($)"
          value={`$${feed.kpis.aiSpendInRangeUsd.toFixed(2)}`}
        />
      </div>

      {/* Cycle health — full width */}
      <CycleHealthPanel data={feed.cycleHealth} rangeDays={days} />

      {/* AI cost trend — full width */}
      <AiCostTrendChart data={feed.aiCostTrend} rangeDays={days} />

      {/* Two-column: agency hit rate + time to fill */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgencyHitRateChart data={feed.agencyHitRate} rangeDays={days} />
        <TimeToFillChart data={feed.timeToFill} rangeDays={days} />
      </div>

      {/* Top performers — full width, renders its own two-table layout internally */}
      <TopPerformersTables data={feed.topPerformers} rangeDays={days} />
    </div>
  )
}
