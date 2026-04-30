import { auth } from '@/lib/auth'
import { getReportsFeed, getAiSpendDetail } from '@/actions/reports'
import { toCsv } from '@/lib/reports/to-csv'

// ── Range parsing ─────────────────────────────────────────────────────────────

const RANGE_MAP: Record<string, 7 | 30 | 90 | 365> = {
  '7d':   7,
  '30d':  30,
  '90d':  90,
  '12mo': 365,
}

function parseRange(raw: string | null): { days: 7 | 30 | 90 | 365; label: string } | null {
  if (!raw) return { days: 30, label: '30d' }
  const days = RANGE_MAP[raw]
  if (!days) return null
  return { days, label: raw }
}

// ── Response helpers ──────────────────────────────────────────────────────────

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ metric: string }> },
): Promise<Response> {
  // 1. Auth
  const session = await auth()
  if (!session?.user?.tenantId) return json({ error: 'Unauthorized' }, 401)

  // 2. Admin gate
  if (session.user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  // 3. Parse range
  const rangeRaw = new URL(req.url).searchParams.get('range')
  const range = parseRange(rangeRaw)
  if (!range) return json({ error: 'Invalid range. Use 7d, 30d, 90d, or 12mo.' }, 400)

  const { days, label: rangeLabel } = range

  // 4. Dispatch by metric
  const { metric } = await params

  // ── AI-spend metrics use a separate loader to avoid paying for the full
  //    ReportsFeed query when only spend data is needed.
  if (metric === 'ai-spend-by-operation') {
    const detail = await getAiSpendDetail({ days })
    const csv = toCsv(detail.byOperation, [
      { key: 'operation',           label: 'Operation' },
      { key: 'calls',               label: 'Calls' },
      { key: 'totalUsd',            label: 'Total USD' },
      { key: 'avgCostPerCallUsd',   label: 'Avg USD per call' },
      { key: 'inputTokens',         label: 'Input tokens' },
      { key: 'outputTokens',        label: 'Output tokens' },
      { key: 'cacheCreationTokens', label: 'Cache creation tokens' },
      { key: 'cacheReadTokens',     label: 'Cache read tokens' },
      { key: 'lastCallAt',          label: 'Last call' },
    ])
    return csvResponse(csv, `ai-spend-by-operation-${rangeLabel}.csv`)
  }

  if (metric === 'ai-spend-by-model') {
    const detail = await getAiSpendDetail({ days })
    const csv = toCsv(detail.byModel, [
      { key: 'model',    label: 'Model' },
      { key: 'calls',    label: 'Calls' },
      { key: 'totalUsd', label: 'Total USD' },
      { key: 'sharePct', label: 'Share %' },
    ])
    return csvResponse(csv, `ai-spend-by-model-${rangeLabel}.csv`)
  }

  if (metric === 'ai-latency-by-operation') {
    const detail = await getAiSpendDetail({ days })
    const csv = toCsv(detail.latencyByOperation, [
      { key: 'operation', label: 'Operation' },
      { key: 'samples',   label: 'Samples' },
      { key: 'p50Ms',     label: 'p50 ms' },
      { key: 'p95Ms',     label: 'p95 ms' },
      { key: 'avgMs',     label: 'Avg ms' },
      { key: 'maxMs',     label: 'Max ms' },
    ])
    return csvResponse(csv, `ai-latency-by-operation-${rangeLabel}.csv`)
  }

  // ── Remaining metrics come from the full ReportsFeed loader ─────────────
  const feed = await getReportsFeed({ days })

  switch (metric) {
    case 'time-to-fill': {
      const csv = toCsv(feed.timeToFill.series, [
        { key: 'customerName',  label: 'customerName' },
        { key: 'avgDaysToFill', label: 'avgDaysToFill' },
        { key: 'rolesFilled',   label: 'rolesFilled' },
      ])
      return csvResponse(csv, `time-to-fill-${rangeLabel}.csv`)
    }

    case 'agency-hit-rate': {
      const csv = toCsv(feed.agencyHitRate.series, [
        { key: 'agencyName',           label: 'agencyName' },
        { key: 'candidatesSubmitted',  label: 'candidatesSubmitted' },
        { key: 'candidatesShortlisted', label: 'candidatesShortlisted' },
        { key: 'candidatesHired',      label: 'candidatesHired' },
        { key: 'submissionToHirePct',  label: 'submissionToHirePct' },
        { key: 'shortlistToHirePct',   label: 'shortlistToHirePct' },
      ])
      return csvResponse(csv, `agency-hit-rate-${rangeLabel}.csv`)
    }

    case 'ai-cost-trend': {
      const csv = toCsv(feed.aiCostTrend.series, [
        { key: 'date',    label: 'date' },
        { key: 'costUsd', label: 'costUsd' },
        { key: 'calls',   label: 'calls' },
      ])
      return csvResponse(csv, `ai-cost-trend-${rangeLabel}.csv`)
    }

    case 'cycle-health': {
      const rows = [
        { metric: 'Roles open >30 days',      value: feed.cycleHealth.rolesOpenOver30Days },
        { metric: 'Expired roles',             value: feed.cycleHealth.expiredRoles },
        { metric: 'Stuck in interviewing',     value: feed.cycleHealth.candidatesStuckInterviewing },
      ]
      const csv = toCsv(rows, [
        { key: 'metric', label: 'metric' },
        { key: 'value',  label: 'value' },
      ])
      return csvResponse(csv, `cycle-health-${rangeLabel}.csv`)
    }

    case 'top-performers': {
      // Two labelled sections in a single file
      const sectionHeader1 = '## Roles closed fastest\r\n'
      const fastest = toCsv(feed.topPerformers.fastestFilledRoles, [
        { key: 'roleTitle',    label: 'roleTitle' },
        { key: 'daysToFill',   label: 'daysToFill' },
        { key: 'customerName', label: 'customerName' },
      ])
      const sectionHeader2 = '\r\n## Top agencies by hit-rate\r\n'
      const topAgencies = toCsv(feed.topPerformers.topAgenciesByHitRate, [
        { key: 'agencyName',          label: 'agencyName' },
        { key: 'submissionToHirePct', label: 'submissionToHirePct' },
        { key: 'candidatesHired',     label: 'candidatesHired' },
      ])
      return csvResponse(
        sectionHeader1 + fastest + sectionHeader2 + topAgencies,
        `top-performers-${rangeLabel}.csv`,
      )
    }

    default:
      return json({ error: 'Unknown metric' }, 404)
  }
}
