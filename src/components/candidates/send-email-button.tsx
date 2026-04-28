'use client'

import { useState } from 'react'
import { MailIcon } from 'lucide-react'
import { SendEmailModal } from './send-email-modal'
import type { EmailTemplate } from '@/db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string | null
  roleTitle?: string
  roleCustomerName?: string
  recruiterName: string
  tenantName: string
  templates: EmailTemplate[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Small client wrapper that holds the modal-open boolean and conditionally
 * renders SendEmailModal. This keeps the heavy modal out of the server
 * component tree until the user clicks "Send email".
 *
 * When candidateEmail is null the button renders in a disabled state with a
 * tooltip explaining why.
 */
export function SendEmailButton({
  candidateId,
  candidateFirstName,
  candidateLastName,
  candidateEmail,
  roleTitle,
  roleCustomerName,
  recruiterName,
  tenantName,
  templates,
}: Props) {
  const [open, setOpen] = useState(false)

  if (!candidateEmail) {
    return (
      <button
        type="button"
        disabled
        title="No email address on file"
        aria-disabled="true"
        className="flex items-center gap-1.5 rounded-md border border-[--color-border]
                   bg-[--color-bg-input] text-[--color-fg-subtle]
                   text-xs font-medium px-3 py-1.5 cursor-not-allowed opacity-50"
      >
        <MailIcon className="h-3.5 w-3.5" />
        Send email
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-[--color-border]
                   bg-[--color-bg-input] text-[--color-fg-muted]
                   text-xs font-medium px-3 py-1.5
                   hover:bg-[--color-bg-elevated] hover:text-[--color-fg]
                   hover:border-blue-500 transition-colors"
      >
        <MailIcon className="h-3.5 w-3.5" />
        Send email
      </button>

      {open && (
        <SendEmailModal
          candidateId={candidateId}
          candidateFirstName={candidateFirstName}
          candidateLastName={candidateLastName}
          candidateEmail={candidateEmail}
          roleTitle={roleTitle}
          roleCustomerName={roleCustomerName}
          recruiterName={recruiterName}
          tenantName={tenantName}
          templates={templates}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
