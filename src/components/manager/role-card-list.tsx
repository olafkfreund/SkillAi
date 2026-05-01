'use client'

import Link from 'next/link'
import { BriefcaseIcon, ClockIcon, CheckCircleIcon } from 'lucide-react'

export type ManagerRoleCard = {
  roleId: string
  title: string
  isActive: boolean
  shortlistSentAt: Date | null
  targetFillDate: string | null
  isPrimary: boolean
  customerName: string | null
  pendingCount: number
}

type Props = {
  roles: ManagerRoleCard[]
}

function daysSince(date: Date): number {
  const now = new Date()
  return Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(value: string | Date | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

export function RoleCardList({ roles }: Props) {
  if (roles.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                    border-[var(--color-border)] bg-[var(--color-bg-app)] px-6 py-16 text-center"
      >
        <BriefcaseIcon className="h-10 w-10 text-[var(--color-fg-subtle)] mb-3" />
        <p className="text-[var(--color-fg-muted)] font-medium">No roles assigned to you yet</p>
        <p className="text-[var(--color-fg-subtle)] text-sm mt-1">
          Your recruiter will assign you when a shortlist is ready.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {roles.map((role) => {
        const sentDaysAgo = role.shortlistSentAt ? daysSince(role.shortlistSentAt) : null

        return (
          <Link
            key={role.roleId}
            href={`/dashboard/roles/${role.roleId}`}
            className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-6 py-5
                       hover:border-blue-500 hover:shadow-sm transition-all block"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {/* Title row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-[var(--color-fg)] truncate">{role.title}</h2>

                  {role.isPrimary && (
                    <span
                      className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800
                                  text-blue-700 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 flex-shrink-0"
                    >
                      Primary reviewer
                    </span>
                  )}

                  {role.pendingCount > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800
                                  text-amber-700 dark:text-amber-300 text-xs font-semibold px-2 py-0.5 flex-shrink-0"
                    >
                      <ClockIcon className="h-3 w-3" aria-hidden="true" />
                      {role.pendingCount} pending
                    </span>
                  )}

                  {role.pendingCount === 0 && role.shortlistSentAt && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800
                                  text-emerald-700 dark:text-emerald-300 text-xs font-medium px-2 py-0.5 flex-shrink-0"
                    >
                      <CheckCircleIcon className="h-3 w-3" aria-hidden="true" />
                      All reviewed
                    </span>
                  )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {role.customerName && (
                    <span className="text-sm text-[var(--color-fg-muted)]">{role.customerName}</span>
                  )}

                  {role.targetFillDate && (
                    <span className="text-xs text-[var(--color-fg-subtle)] tabular-nums">
                      Fill by {formatDate(role.targetFillDate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Shortlist sent badge — right-aligned */}
              <div className="flex-shrink-0 text-right">
                {sentDaysAgo !== null ? (
                  <span className="text-xs text-[var(--color-fg-muted)] whitespace-nowrap">
                    Sent{' '}
                    {sentDaysAgo === 0
                      ? 'today'
                      : sentDaysAgo === 1
                        ? '1 day ago'
                        : `${sentDaysAgo} days ago`}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap">Not sent yet</span>
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
