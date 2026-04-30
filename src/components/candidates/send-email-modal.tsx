'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon, SendIcon, ChevronLeftIcon, PencilIcon } from 'lucide-react'
import { sendCandidateEmail } from '@/actions/emails'
import { substituteTemplate } from '@/lib/email/substitute'
import type { EmailTemplate } from '@/db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  roleTitle?: string
  roleCustomerName?: string
  recruiterName: string
  tenantName: string
  templates: EmailTemplate[]
  onClose: () => void
}

type Step = 'pick' | 'preview'

// Category display labels
const CATEGORY_LABELS: Record<string, string> = {
  screening_invite: 'Screening Invite',
  scoring_decline: 'Decline',
  post_interview: 'Post Interview',
  rejection: 'Rejection',
  offer_pending: 'Offer Pending',
  custom: 'Custom',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendEmailModal({
  candidateId,
  candidateFirstName,
  candidateLastName,
  candidateEmail,
  roleTitle = '',
  roleCustomerName = '',
  recruiterName,
  tenantName,
  templates,
  onClose,
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('pick')
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)

  // Editable subject / body (step 2)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [editingSubject, setEditingSubject] = useState(false)
  const [editingBody, setEditingBody] = useState(false)

  // Inline confirm-send state
  const [confirming, setConfirming] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Build substitution vars matching server-side keys
  const vars: Record<string, string> = {
    'candidate.firstName': candidateFirstName,
    'candidate.lastName': candidateLastName,
    'candidate.email': candidateEmail,
    'role.title': roleTitle,
    'role.customerName': roleCustomerName,
    'recruiter.name': recruiterName,
    'tenant.name': tenantName,
    'tenant.followUpWindow': '5',
  }

  // Live preview — re-substitute on every keystroke
  const previewSubject = substituteTemplate(subject, vars)
  const previewBody = substituteTemplate(body, vars)

  function handlePickTemplate(template: EmailTemplate) {
    setSelectedTemplate(template)
    setSubject(template.subject)
    setBody(template.body)
    setEditingSubject(false)
    setEditingBody(false)
    setConfirming(false)
    setSendError(null)
    setStep('preview')
  }

  function handleBack() {
    setStep('pick')
    setConfirming(false)
    setSendError(null)
  }

  function handleSend() {
    setSendError(null)
    startTransition(async () => {
      const result = await sendCandidateEmail({
        candidateId,
        templateId: selectedTemplate?.id,
        overrideSubject: previewSubject,
        overrideBody: previewBody,
      })
      if (!result.success) {
        setSendError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
      onClose()
    })
  }

  // Group templates by category for display
  const grouped = templates.reduce<Record<string, EmailTemplate[]>>((acc, t) => {
    const key = t.category
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-email-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Card */}
      <div className="relative w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-[--color-border] bg-[--color-bg-elevated] shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[--color-border] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back to template selection"
                className="rounded p-2 md:p-1 text-[--color-fg-subtle] hover:text-[--color-fg]
                           hover:bg-[--color-bg-input] transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}
            <h2 id="send-email-modal-title" className="font-semibold text-[--color-fg]">
              {step === 'pick' ? 'Send email to candidate' : 'Preview & send'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[--color-fg-subtle] hover:text-[--color-fg]
                       hover:bg-[--color-bg-input] transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── Step 1: Pick template ─────────────────────────────────────── */}
          {step === 'pick' && (
            <div>
              <p className="text-sm text-[--color-fg-muted] mb-4">
                Sending to{' '}
                <span className="font-medium text-[--color-fg]">{candidateFirstName} {candidateLastName}</span>
                {' '}at{' '}
                <span className="font-medium text-[--color-fg]">{candidateEmail}</span>
              </p>
              {templates.length === 0 ? (
                <p className="text-sm text-[--color-fg-subtle]">
                  No email templates found. Ask an admin to set up templates in Settings.
                </p>
              ) : (
                <div className="space-y-5">
                  {Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-subtle] mb-2">
                        {CATEGORY_LABELS[category] ?? category}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handlePickTemplate(t)}
                            className="w-full text-left rounded-md border border-[--color-border]
                                       bg-[--color-bg-input] px-4 py-3
                                       hover:border-blue-500 hover:bg-blue-950/30
                                       transition-colors group"
                          >
                            <p className="text-sm font-medium text-[--color-fg] group-hover:text-blue-300">
                              {t.name}
                            </p>
                            <p className="text-xs text-[--color-fg-subtle] mt-0.5 truncate">
                              {t.subject}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Preview ───────────────────────────────────────────── */}
          {step === 'preview' && selectedTemplate && (
            <div className="space-y-4">
              <p className="text-xs text-[--color-fg-subtle]">
                Template: <span className="text-[--color-fg-muted]">{selectedTemplate.name}</span>
              </p>

              {/* Subject */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-subtle]">
                    Subject
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingSubject((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-[--color-fg-subtle]
                               hover:text-[--color-fg] transition-colors"
                    aria-pressed={editingSubject}
                  >
                    <PencilIcon className="h-3 w-3" />
                    {editingSubject ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editingSubject ? (
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-md bg-[--color-bg-input] border border-[--color-border]
                               text-sm text-[--color-fg] px-3 py-2
                               focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <div className="rounded-md bg-[--color-bg-input] border border-[--color-border] px-3 py-2">
                    <p className="text-sm text-[--color-fg]">{previewSubject || <span className="text-[--color-fg-subtle] italic">Empty subject</span>}</p>
                  </div>
                )}
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-subtle]">
                    Body
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingBody((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-[--color-fg-subtle]
                               hover:text-[--color-fg] transition-colors"
                    aria-pressed={editingBody}
                  >
                    <PencilIcon className="h-3 w-3" />
                    {editingBody ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editingBody ? (
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="w-full rounded-md bg-[--color-bg-input] border border-[--color-border]
                               text-sm text-[--color-fg] px-3 py-2
                               focus:outline-none focus:ring-1 focus:ring-blue-500
                               resize-y"
                  />
                ) : (
                  <div className="rounded-md bg-[--color-bg-input] border border-[--color-border] px-3 py-2
                                  max-h-64 overflow-y-auto">
                    {/* previewBody is rendered as React text — never dangerouslySetInnerHTML */}
                    <pre className="text-sm text-[--color-fg-muted] whitespace-pre-wrap font-sans">
                      {previewBody || <span className="text-[--color-fg-subtle] italic">Empty body</span>}
                    </pre>
                  </div>
                )}
                <p className="text-xs text-[--color-fg-subtle] mt-1.5">
                  Variables are substituted in real time. Missing variables are replaced with an empty string.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer — only shown on preview step */}
        {step === 'preview' && (
          <div className="border-t border-[--color-border] px-6 py-4 shrink-0">
            {sendError && (
              <p className="text-xs text-red-400 mb-3">{sendError}</p>
            )}

            {confirming ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-amber-300">
                  Send to <span className="font-medium">{candidateEmail}</span>?
                </span>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600
                             hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5
                             transition-colors disabled:opacity-50"
                >
                  <SendIcon className="h-3.5 w-3.5" />
                  {isPending ? 'Sending…' : 'Yes, send'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[--color-border]
                             text-[--color-fg-muted] hover:text-[--color-fg] text-sm font-medium px-3 py-1.5
                             transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600
                           hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5
                           transition-colors disabled:opacity-50"
              >
                <SendIcon className="h-3.5 w-3.5" />
                Send email
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
