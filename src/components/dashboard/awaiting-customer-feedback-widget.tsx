import Link from 'next/link'
import {
  getRecentSubmissionsForTenant,
  type SubmissionForDashboard,
} from '@/actions/role-submissions'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'

// Mirrors the timeAgo helper in submission-row.tsx — inlined here per scope-minimisation rule.
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

export async function AwaitingCustomerFeedbackWidget() {
  const submissions = await getRecentSubmissionsForTenant({
    status: ['submitted', 'interview_scheduled', 'feedback_pending'],
    limit: 5,
  })

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">
          Awaiting customer feedback
          {submissions.length > 0 && (
            <span className="ml-2 text-xs font-normal normal-case tracking-normal text-[var(--color-fg-subtle)]">
              ({submissions.length})
            </span>
          )}
        </h2>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)] py-4 text-center">
          No open submissions.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {submissions.map((sub: SubmissionForDashboard) => (
            <li key={sub.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/dashboard/roles/${sub.roleId}`}
                className="flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors truncate">
                    {sub.candidateFirstName} {sub.candidateLastName}
                  </p>
                  <p className="text-xs text-[var(--color-fg-subtle)] truncate mt-0.5">
                    {sub.roleTitle}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <SubmissionStatusPill status={sub.status} />
                  <span className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap">
                    Sent {timeAgo(sub.sentAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
