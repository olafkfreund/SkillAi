import Link from 'next/link'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'
import type { SubmissionWithDetails } from '@/actions/role-submissions'

// Page-level extended type: getAllSubmissionsForTenant joins roleTitle + customerName
// onto SubmissionWithDetails. We re-declare the minimal shape the card needs so this
// component doesn't have to import the page-private SubmissionRow typedef.
type SubmissionCardProps = {
  submission: SubmissionWithDetails & {
    roleTitle: string
    customerName: string | null
  }
  timeAgo: (date: Date) => string
}

export function SubmissionCard({ submission, timeAgo }: SubmissionCardProps) {
  const { candidate } = submission

  const initials = (
    (candidate.firstName[0] ?? '') +
    (candidate.lastName[0] ?? '')
  ).toUpperCase()

  const roleLine = submission.customerName
    ? `${submission.roleTitle} · ${submission.customerName}`
    : submission.roleTitle

  return (
    <div
      className="bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border)] p-4 mb-2"
    >
      {/* Row 1: candidate name + status pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Agency logo / initials — 20px per codebase convention */}
          {candidate.agencyId && candidate.agencyLogoPath ? (
            <img
              src={`/api/agencies/${candidate.agencyId}/logo`}
              alt={candidate.agencyName ?? ''}
              width={20}
              height={20}
              className="rounded-full bg-zinc-800 object-contain shrink-0"
              style={{ width: 20, height: 20 }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-full bg-zinc-800
                         text-zinc-400 text-[10px] font-semibold shrink-0"
              style={{ width: 20, height: 20 }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}

          <Link
            href={`/dashboard/candidates/${submission.candidateId}?roleId=${submission.roleId}`}
            className="font-semibold text-[var(--color-fg)] hover:text-blue-400 truncate
                       transition-colors"
          >
            {candidate.firstName} {candidate.lastName}
          </Link>
        </div>

        <SubmissionStatusPill status={submission.status} />
      </div>

      {/* Row 2: role · customer */}
      <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)] truncate">
        {roleLine}
      </p>

      {/* Row 3: timing */}
      <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)] tabular-nums">
        Sent {timeAgo(submission.sentAt)} · last update {timeAgo(submission.statusUpdatedAt)}
      </p>
    </div>
  )
}
