import type { SubmissionWithDetails } from '@/actions/role-submissions'
import { SubmissionRow } from './submission-row'

type Props = {
  submissions: SubmissionWithDetails[]
  audience: 'recruiter' | 'customer' | 'manager'
}

export function SentToCustomerPanel({ submissions, audience }: Props) {
  if (audience !== 'recruiter') return null

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-fg)] uppercase tracking-wide">
          Sent to Customer
        </h2>
        <span className="text-sm text-[var(--color-fg-subtle)]">({submissions.length})</span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-subtle)]">
          No candidates submitted to the customer yet. Tick candidates above and click &ldquo;Submit to customer&rdquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {submissions.map((submission) => (
            <SubmissionRow key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </div>
  )
}
