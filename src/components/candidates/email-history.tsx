import type { SentEmail } from '@/db/schema/sent-emails'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  sentEmails: SentEmail[]
  audience?: 'recruiter' | 'customer' | 'manager'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Server component that renders the sent-email history for a candidate.
 * Hidden entirely when audience === 'manager' — managers shouldn't see
 * internal email correspondence.
 */
export function EmailHistory({ sentEmails, audience = 'recruiter' }: Props) {
  if (audience === 'manager') return null

  return (
    <div className="bg-[--color-bg-elevated] rounded-xl border border-[--color-border] p-6 mb-6">
      <h2 className="font-semibold text-[--color-fg] mb-4">
        Email History ({sentEmails.length})
      </h2>

      {sentEmails.length === 0 ? (
        <p className="text-sm text-[--color-fg-subtle]">No emails sent to this candidate yet.</p>
      ) : (
        <div className="space-y-2">
          {sentEmails.map((email) => (
            <div
              key={email.id}
              className="rounded-md bg-[--color-bg-input] border border-[--color-border] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[--color-fg] truncate">
                      {email.templateName}
                    </p>
                    {/* Status pill */}
                    {email.sendStatus === 'sent' ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5
                                   bg-green-950 text-green-300 text-xs font-medium"
                      >
                        Sent
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5
                                   bg-red-950 text-red-300 text-xs font-medium cursor-help"
                        title={email.errorMessage ?? 'Send failed'}
                        role="status"
                        aria-label={`Failed: ${email.errorMessage ?? 'Unknown error'}`}
                      >
                        Failed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[--color-fg-subtle] mt-1 truncate">
                    To: {email.recipientEmail}
                  </p>
                  <p className="text-xs text-[--color-fg-subtle] mt-0.5">
                    {email.subject}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-[--color-fg-subtle]">
                    {formatTimestamp(email.sentAt)}
                  </p>
                  {email.senderName && (
                    <p className="text-xs text-[--color-fg-subtle] mt-0.5">
                      by {email.senderName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
