// Usage:
// <TopPerformersTables data={feed.topPerformers} rangeDays={30} />

import Link from 'next/link'
import type { ReportsFeed } from '@/actions/reports'

type Props = {
  data: ReportsFeed['topPerformers']
  rangeDays: number
}

export function TopPerformersTables({ data, rangeDays }: Props) {
  const rangeParam = rangeDays === 365 ? '12mo' : `${rangeDays}d`

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-[var(--color-fg)]">
          Top performers
        </h2>
        <a
          href={`/api/reports/top-performers/csv?range=${rangeParam}`}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-input)]"
        >
          Export CSV
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sub-card 1: Fastest filled roles */}
        <div className="bg-[var(--color-bg-app)] rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-medium text-[var(--color-fg-muted)] mb-3">
            Roles closed fastest
          </h3>
          {data.fastestFilledRoles.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)] py-6 text-center">
              No data for this range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-fg-subtle)] border-b border-[var(--color-border)]">
                    <th className="py-2 pr-3 font-normal">Role</th>
                    <th className="py-2 pr-3 font-normal">Customer</th>
                    <th className="py-2 font-normal text-right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fastestFilledRoles.map((row) => (
                    <tr
                      key={row.roleId}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/dashboard/roles/${row.roleId}`}
                          className="text-[var(--color-fg)] hover:text-blue-400 transition-colors"
                        >
                          {row.roleTitle}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-fg-muted)]">
                        {row.customerName ?? '—'}
                      </td>
                      <td className="py-2 text-right font-medium text-emerald-500">
                        {row.daysToFill}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sub-card 2: Top agencies by hit-rate */}
        <div className="bg-[var(--color-bg-app)] rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-medium text-[var(--color-fg-muted)] mb-3">
            Top agencies by hit-rate
          </h3>
          {data.topAgenciesByHitRate.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)] py-6 text-center">
              No data for this range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-fg-subtle)] border-b border-[var(--color-border)]">
                    <th className="py-2 pr-3 font-normal">Agency</th>
                    <th className="py-2 pr-3 font-normal text-right">Hit-rate</th>
                    <th className="py-2 font-normal text-right">Hires</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topAgenciesByHitRate.map((row) => (
                    <tr
                      key={row.agencyId}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/dashboard/agencies/${row.agencyId}`}
                          className="text-[var(--color-fg)] hover:text-blue-400 transition-colors"
                        >
                          {row.agencyName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right font-medium text-emerald-500">
                        {row.submissionToHirePct.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right text-[var(--color-fg-muted)]">
                        {row.candidatesHired}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
