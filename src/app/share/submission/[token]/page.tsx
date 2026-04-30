import { getSubmissionByToken } from '@/actions/role-submissions'
import { SubmissionStatusPill } from '@/components/roles/submission-status-pill'
import { UpdateForm } from './update-form'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Expired / revoked panel
// ---------------------------------------------------------------------------

function ExpiredPanel() {
  return (
    <main className="min-h-screen bg-[var(--color-bg-app)] flex items-start justify-center py-16 px-4">
      <div
        className="max-w-xl w-full bg-[var(--color-bg-elevated)] rounded-xl
                   border border-[var(--color-border)] p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full
                       bg-red-950 border border-red-800"
            aria-hidden="true"
          >
            <svg
              className="w-6 h-6 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636L5.636 18.364M5.636 5.636l12.728 12.728"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--color-fg)]">
              This link has expired or been revoked
            </h1>
            <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
              Please contact your recruiter if you need to update this submission.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Props = { params: Promise<{ token: string }> }

export default async function ShareSubmissionPage({ params }: Props) {
  const { token } = await params
  const submission = await getSubmissionByToken(token)

  if (!submission) {
    return <ExpiredPanel />
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg-app)] flex items-start justify-center py-16 px-4">
      <div
        className="max-w-xl w-full bg-[var(--color-bg-elevated)] rounded-xl
                   border border-[var(--color-border)] p-8 shadow-xl"
      >
        {/* Page header — tenant name only; no internal branding */}
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-[var(--color-fg-subtle)]">
            {submission.tenantName}
          </p>
          <h1 className="text-xl font-semibold text-[var(--color-fg)] mt-1">
            Update submission status
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-2">
            Updates here will be visible to your recruiter at{' '}
            <span className="font-medium text-[var(--color-fg)]">{submission.tenantName}</span>.
          </p>
        </header>

        {/* Submission summary card */}
        <div
          className="bg-[var(--color-bg-app)] rounded-lg border border-[var(--color-border)] p-5 mb-6"
        >
          <p className="text-base font-medium text-[var(--color-fg)]">
            {submission.candidateFirstName} {submission.candidateLastName}
          </p>
          <p className="text-sm text-[var(--color-fg-muted)] mt-1">{submission.roleTitle}</p>
          <div className="flex items-center gap-2 mt-3">
            <SubmissionStatusPill status={submission.status} />
            <span className="text-xs text-[var(--color-fg-subtle)]">
              Sent {timeAgo(submission.sentAt)}
            </span>
          </div>
        </div>

        <UpdateForm token={token} currentStatus={submission.status} />
      </div>
    </main>
  )
}
