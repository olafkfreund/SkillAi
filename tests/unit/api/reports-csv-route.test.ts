import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks — must be declared before any imports that transitively load them ───

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/actions/reports', () => ({ getReportsFeed: vi.fn() }))

// ── Import subjects after mocks ───────────────────────────────────────────────

import { GET } from '@/app/api/reports/[metric]/csv/route'
import { auth } from '@/lib/auth'
import { getReportsFeed } from '@/actions/reports'
import type { ReportsFeed } from '@/actions/reports'

const mockAuth = vi.mocked(auth)
const mockFeed = vi.mocked(getReportsFeed)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { tenantId: 't1', role: 'admin' as const },
  expires: '2099-01-01',
}

const RECRUITER_SESSION = {
  user: { tenantId: 't1', role: 'recruiter' as const },
  expires: '2099-01-01',
}

/** Minimal valid ReportsFeed that satisfies all switch branches */
const MINIMAL_FEED: ReportsFeed = {
  rangeDays: 30,
  generatedAt: new Date('2026-04-28T00:00:00Z'),
  kpis: {
    activeRoles: 0,
    candidatesAddedInRange: 0,
    candidatesScoredInRange: 0,
    candidatesHiredInRange: 0,
    aiSpendInRangeUsd: 0,
  },
  timeToFill: {
    series: [{ customerName: 'Acme', avgDaysToFill: 14, rolesFilled: 2 }],
    totalRolesFilled: 2,
    averageDaysOverall: 14,
    hasLimitedHistoricalData: true,
  },
  agencyHitRate: {
    series: [
      {
        agencyId: 'a1',
        agencyName: 'TopTalent',
        candidatesSubmitted: 10,
        candidatesShortlisted: 4,
        candidatesHired: 2,
        submissionToHirePct: 20,
        shortlistToHirePct: 50,
      },
    ],
  },
  aiCostTrend: {
    series: [{ date: '2026-04-01', costUsd: 1.23, calls: 5 }],
    totalUsd: 1.23,
    monthOverMonthPct: null,
  },
  cycleHealth: {
    rolesOpenOver30Days: 3,
    expiredRoles: 1,
    candidatesStuckInterviewing: 2,
  },
  topPerformers: {
    fastestFilledRoles: [
      { roleId: 'r1', roleTitle: 'SRE', daysToFill: 7, customerName: 'Acme' },
    ],
    topAgenciesByHitRate: [
      { agencyId: 'a1', agencyName: 'TopTalent', submissionToHirePct: 20, candidatesHired: 2 },
    ],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string): Request {
  return new Request(url)
}

function makeParams(metric: string): { params: Promise<{ metric: string }> } {
  return { params: Promise.resolve({ metric }) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/reports/[metric]/csv', () => {
  it('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv?range=30d'),
      makeParams('time-to-fill'),
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when the session role is recruiter', async () => {
    mockAuth.mockResolvedValue(RECRUITER_SESSION as never)
    const res = await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv?range=30d'),
      makeParams('time-to-fill'),
    )
    expect(res.status).toBe(403)
  })

  it('returns 200 with correct Content-Type for time-to-fill', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockFeed.mockResolvedValue(MINIMAL_FEED)
    const res = await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv?range=30d'),
      makeParams('time-to-fill'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
  })

  it('returns the expected header row for time-to-fill', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockFeed.mockResolvedValue(MINIMAL_FEED)
    const res = await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv?range=30d'),
      makeParams('time-to-fill'),
    )
    const body = await res.text()
    expect(body.startsWith('customerName,avgDaysToFill,rolesFilled\r\n')).toBe(true)
  })

  it('returns 404 for an unknown metric', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockFeed.mockResolvedValue(MINIMAL_FEED)
    const res = await GET(
      makeReq('http://localhost/api/reports/fish/csv?range=30d'),
      makeParams('fish'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid range value', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    const res = await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv?range=random'),
      makeParams('time-to-fill'),
    )
    expect(res.status).toBe(400)
  })

  it('defaults to 30 days when range param is missing', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockFeed.mockResolvedValue(MINIMAL_FEED)
    await GET(
      makeReq('http://localhost/api/reports/time-to-fill/csv'),
      makeParams('time-to-fill'),
    )
    expect(mockFeed).toHaveBeenCalledWith({ days: 30 })
  })

  it('returns 200 for all five valid metrics', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION as never)
    mockFeed.mockResolvedValue(MINIMAL_FEED)

    const metrics = [
      'time-to-fill',
      'agency-hit-rate',
      'ai-cost-trend',
      'cycle-health',
      'top-performers',
    ]

    for (const metric of metrics) {
      const res = await GET(
        makeReq(`http://localhost/api/reports/${metric}/csv?range=30d`),
        makeParams(metric),
      )
      expect(res.status, `Expected 200 for metric "${metric}"`).toBe(200)
    }
  })
})
