/**
 * ForYouSection — personalised action stream rendered above the main dashboard
 * content (GitHub Issue #84).
 *
 * Pure presentational server component — all data comes in via props.
 * No auth() or DB calls here.
 */

import Link from 'next/link'
import type { ForYouFeed } from '@/actions/dashboard-tasks'
import type { SubmissionForDashboard } from '@/actions/role-submissions'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'

type Props = {
  feed: ForYouFeed
}

// ── Shared card wrapper ────────────────────────────────────────────────────────

function WidgetCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      {children}
    </div>
  )
}

// ── Widget header ──────────────────────────────────────────────────────────────

function WidgetHeader({
  title,
  count,
  viewAllHref,
  viewAllLabel = 'View all',
}: {
  title: string
  count: number
  viewAllHref?: string
  viewAllLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-[var(--color-fg)]">
        {title}
        {count > 0 && (
          <span className="ml-2 text-xs text-[var(--color-fg-muted)]">({count})</span>
        )}
      </h3>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {viewAllLabel}
        </Link>
      )}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <p className="text-sm text-[var(--color-fg-subtle)] py-4 text-center">No items.</p>
  )
}

// ── 1. Pending interviews widget ───────────────────────────────────────────────

function PendingInterviewsWidget({
  items,
}: {
  items: ForYouFeed['pendingInterviews']
}) {
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <WidgetCard>
      <WidgetHeader
        title="Interviews today & tomorrow"
        count={items.length}
        viewAllHref="/dashboard/interviews"
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <li key={item.slotId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/candidates/${item.candidateId}`}
                    className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors truncate block"
                  >
                    {item.candidateName}
                  </Link>
                  {item.roleId && item.roleTitle && (
                    <Link
                      href={`/dashboard/roles/${item.roleId}`}
                      className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors truncate block"
                    >
                      {item.roleTitle}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-[var(--color-fg-muted)] tabular-nums">
                    {fmt.format(item.scheduledAt)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.isToday
                        ? 'bg-amber-900/40 text-amber-300'
                        : 'bg-blue-900/40 text-blue-300'
                    }`}
                  >
                    {item.isToday ? 'today' : 'tomorrow'}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── 2. Pending approvals widget ────────────────────────────────────────────────

function PendingApprovalsWidget({
  items,
}: {
  items: ForYouFeed['pendingApprovals']
}) {
  const now = Date.now()

  return (
    <WidgetCard>
      <WidgetHeader
        title="Awaiting your approval"
        count={items.length}
        viewAllHref="/dashboard/manager"
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => {
            const daysSinceSent = item.sentAt
              ? Math.floor((now - item.sentAt.getTime()) / (1000 * 60 * 60 * 24))
              : null
            return (
              <li key={item.roleId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/roles/${item.roleId}`}
                      className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors truncate block"
                    >
                      {item.roleTitle}
                    </Link>
                    {daysSinceSent !== null && (
                      <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                        Sent {daysSinceSent === 0 ? 'today' : `${daysSinceSent}d ago`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-amber-300 font-medium flex-shrink-0 whitespace-nowrap">
                    {item.pendingCount} pending
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── 3. Candidates awaiting score widget ────────────────────────────────────────

function CandidatesAwaitingScoreWidget({
  items,
}: {
  items: ForYouFeed['candidatesAwaitingScore']
}) {
  return (
    <WidgetCard>
      <WidgetHeader
        title="Candidates awaiting score"
        count={items.length}
        viewAllHref="/dashboard/candidates"
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item, idx) => (
            <li key={`${item.candidateId}-${item.roleId}-${idx}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/candidates/${item.candidateId}`}
                    className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors truncate block"
                  >
                    {item.candidateName}
                  </Link>
                  <Link
                    href={`/dashboard/roles/${item.roleId}`}
                    className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors truncate block"
                  >
                    {item.roleTitle}
                  </Link>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${
                    item.scoreStatus === 'processing'
                      ? 'bg-amber-900/40 text-amber-300'
                      : 'bg-blue-900/40 text-blue-300'
                  }`}
                >
                  {item.scoreStatus}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── 4. Stale priorities widget ─────────────────────────────────────────────────

function StalePrioritiesWidget({
  items,
}: {
  items: ForYouFeed['stalePriorities']
}) {
  return (
    <WidgetCard>
      <WidgetHeader
        title="Roles with stale priorities"
        count={items.length}
        viewAllHref="/dashboard/roles"
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <li key={item.roleId} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/dashboard/roles/${item.roleId}`}
                className="flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate block">
                    {item.roleTitle}
                  </span>
                  <span className="text-xs text-[var(--color-fg-subtle)]">
                    {item.staleCandidateCount} candidate{item.staleCandidateCount === 1 ? '' : 's'} need re-scoring
                  </span>
                </div>
                <span className="text-xs text-violet-400 flex-shrink-0 whitespace-nowrap">
                  Re-score
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── 5. Expired roles widget ────────────────────────────────────────────────────

function ExpiredRolesWidget({
  items,
}: {
  items: ForYouFeed['expiredRoles']
}) {
  return (
    <WidgetCard>
      <WidgetHeader
        title="Expired roles"
        count={items.length}
        viewAllHref="/dashboard/roles?filter=expired"
        viewAllLabel="View all"
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <li key={item.roleId} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/dashboard/roles/${item.roleId}`}
                className="flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate block">
                    {item.roleTitle}
                  </span>
                  {item.customerName && (
                    <span className="text-xs text-[var(--color-fg-subtle)] truncate block">
                      {item.customerName}
                    </span>
                  )}
                </div>
                <span className="text-xs flex-shrink-0 whitespace-nowrap">
                  Expired{' '}
                  <span className="text-red-400 font-medium">{item.daysExpired}d ago</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── 6. Stale submissions widget ────────────────────────────────────────────────
// Recruiter-only: submissions with no status change in >7 days that are still
// open (not hired/rejected/withdrawn). Prompts recruiter to follow up.

// Helper kept outside the component body so the `Date.now()` call is not
// flagged as impure-during-render by react-hooks/purity (matches the timeAgo
// pattern used by awaiting-customer-feedback-widget.tsx).
function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

function StaleSubmissionsWidget({
  items,
}: {
  items: SubmissionForDashboard[]
}) {
  return (
    <WidgetCard>
      <WidgetHeader
        title="Stale submissions"
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => {
            const daysSinceUpdate = daysSince(item.statusUpdatedAt)
            return (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/dashboard/roles/${item.roleId}`}
                  className="flex items-start justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate block">
                      {item.candidateFirstName} {item.candidateLastName}
                    </span>
                    <span className="text-xs text-[var(--color-fg-subtle)] truncate block">
                      {item.roleTitle}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <SubmissionStatusPill status={item.status} />
                    <span className="text-xs text-amber-400 whitespace-nowrap">
                      No update in {daysSinceUpdate}d
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}

// ── Root export ────────────────────────────────────────────────────────────────

export function ForYouSection({ feed }: Props) {
  const {
    pendingInterviews,
    pendingApprovals,
    candidatesAwaitingScore,
    stalePriorities,
    expiredRoles,
    staleSubmissions,
  } = feed

  const isEmpty =
    pendingInterviews.length === 0 &&
    pendingApprovals.length === 0 &&
    candidatesAwaitingScore.length === 0 &&
    stalePriorities.length === 0 &&
    expiredRoles.length === 0 &&
    staleSubmissions.length === 0

  if (isEmpty) {
    return (
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5 mb-8">
        <p className="text-sm text-[var(--color-fg-subtle)] text-center">
          Nothing on your plate today.
        </p>
      </div>
    )
  }

  return (
    <section className="mb-8" aria-label="For you">
      <h2 className="text-xs font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wide mb-3">
        For you
      </h2>
      <div className="flex flex-col gap-4">
        {pendingInterviews.length > 0 && (
          <PendingInterviewsWidget items={pendingInterviews} />
        )}
        {pendingApprovals.length > 0 && (
          <PendingApprovalsWidget items={pendingApprovals} />
        )}
        {candidatesAwaitingScore.length > 0 && (
          <CandidatesAwaitingScoreWidget items={candidatesAwaitingScore} />
        )}
        {stalePriorities.length > 0 && (
          <StalePrioritiesWidget items={stalePriorities} />
        )}
        {expiredRoles.length > 0 && (
          <ExpiredRolesWidget items={expiredRoles} />
        )}
        {staleSubmissions.length > 0 && (
          <StaleSubmissionsWidget items={staleSubmissions} />
        )}
      </div>
    </section>
  )
}
