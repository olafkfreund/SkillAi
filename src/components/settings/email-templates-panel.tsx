'use client'

/**
 * EmailTemplatesPanel — client component for managing per-tenant email templates.
 *
 * Templates are passed as a prop from the server-component settings page.
 * Mutations use useTransition + server actions:
 *   createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
 *   seedTemplatesForCurrentTenant
 *
 * Usage (in settings/page.tsx):
 *   const templates = await listEmailTemplates()
 *   <EmailTemplatesPanel initial={templates} currentUserRole={session.user.role} />
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  MailIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from 'lucide-react'
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '@/actions/email-templates'
import { seedTemplatesForCurrentTenant } from '@/actions/emails'
import type { EmailTemplate } from '@/db/schema'
import type { EmailTemplateCategory } from '@/db/schema'
import { EMAIL_TEMPLATE_CATEGORIES } from '@/db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  initial: EmailTemplate[]
  currentUserRole: string
}

// ---------------------------------------------------------------------------
// Category badge configuration
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<
  EmailTemplateCategory,
  { label: string; bgVar: string; fgVar: string }
> = {
  screening_invite: {
    label: 'Screening invite',
    bgVar: '--color-status-new-bg',
    fgVar: '--color-status-new-fg',
  },
  scoring_decline: {
    label: 'Scoring decline',
    bgVar: '--color-status-rejected-bg',
    fgVar: '--color-status-rejected-fg',
  },
  post_interview: {
    label: 'Post interview',
    bgVar: '--color-status-interviewing-bg',
    fgVar: '--color-status-interviewing-fg',
  },
  rejection: {
    label: 'Rejection',
    bgVar: '--color-status-rejected-bg',
    fgVar: '--color-status-rejected-fg',
  },
  offer_pending: {
    label: 'Offer pending',
    bgVar: '--color-status-offered-bg',
    fgVar: '--color-status-offered-fg',
  },
  custom: {
    label: 'Custom',
    bgVar: '--color-status-shortlisted-bg',
    fgVar: '--color-status-shortlisted-fg',
  },
}

// ---------------------------------------------------------------------------
// Available substitution variables help text
// ---------------------------------------------------------------------------

const SUBSTITUTION_VARS = [
  '{{candidate.firstName}}',
  '{{candidate.lastName}}',
  '{{candidate.email}}',
  '{{role.title}}',
  '{{role.customerName}}',
  '{{recruiter.name}}',
  '{{tenant.name}}',
  '{{tenant.followUpWindow}}',
]

// ---------------------------------------------------------------------------
// Shared input class
// ---------------------------------------------------------------------------

const INPUT_BASE =
  'w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] ' +
  'text-[var(--color-fg)] px-3 py-2 placeholder:text-[var(--color-fg-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: EmailTemplateCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.custom
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: `var(${cfg.bgVar})`,
        color: `var(${cfg.fgVar})`,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Template modal (create + edit)
// ---------------------------------------------------------------------------

type ModalMode =
  | { type: 'create' }
  | { type: 'edit'; template: EmailTemplate }

function TemplateModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: ModalMode
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = mode.type === 'edit'
  const tpl = isEdit ? mode.template : null

  const [name, setName] = useState(tpl?.name ?? '')
  const [category, setCategory] = useState<EmailTemplateCategory>(
    (tpl?.category as EmailTemplateCategory) ?? 'custom'
  )
  const [subject, setSubject] = useState(tpl?.subject ?? '')
  const [body, setBody] = useState(tpl?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }
    if (!subject.trim()) { setError('Subject is required.'); return }
    if (!body.trim()) { setError('Body is required.'); return }

    startTransition(async () => {
      if (isEdit && tpl) {
        const result = await updateEmailTemplate(tpl.id, {
          name: name.trim(),
          subject: subject.trim(),
          body: body.trim(),
        })
        if (result.success) {
          onSaved()
        } else {
          setError(result.error)
        }
      } else {
        const result = await createEmailTemplate({
          name: name.trim(),
          category,
          subject: subject.trim(),
          body: body.trim(),
        })
        if (result.success) {
          onSaved()
        } else {
          setError(result.error)
        }
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
    >
      <div className="w-[calc(100vw-2rem)] max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="template-modal-title" className="text-base font-semibold text-[var(--color-fg)]">
            {isEdit ? 'Edit template' : 'Create template'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="p-2 md:p-1 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] disabled:opacity-50"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="tpl-name"
              className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
            >
              Name <span className="text-[var(--color-fg-subtle)]">(max 80 chars)</span>
            </label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Technical screening invite"
              disabled={pending}
              className={INPUT_BASE}
              autoComplete="off"
            />
          </div>

          {/* Category — read-only on edit, editable on create */}
          <div>
            <label
              htmlFor="tpl-category"
              className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
            >
              Category
            </label>
            {isEdit ? (
              <div>
                <CategoryBadge category={(tpl?.category as EmailTemplateCategory) ?? 'custom'} />
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                  Category cannot be changed after creation.
                </p>
              </div>
            ) : (
              <select
                id="tpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as EmailTemplateCategory)}
                disabled={pending}
                className={INPUT_BASE}
              >
                {EMAIL_TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_CONFIG[cat]?.label ?? cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subject */}
          <div>
            <label
              htmlFor="tpl-subject"
              className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
            >
              Subject <span className="text-[var(--color-fg-subtle)]">(max 200 chars)</span>
            </label>
            <input
              id="tpl-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="e.g. {{role.title}} — screening call with {{tenant.name}}"
              disabled={pending}
              className={INPUT_BASE}
              autoComplete="off"
            />
          </div>

          {/* Body */}
          <div>
            <label
              htmlFor="tpl-body"
              className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1.5"
            >
              Body
            </label>
            <textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder="Dear {{candidate.firstName}},&#10;&#10;..."
              disabled={pending}
              className={INPUT_BASE + ' font-mono resize-y'}
            />
          </div>

          {/* Substitution variables help */}
          <div className="rounded-md bg-[var(--color-bg-input)] border border-[var(--color-border)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[var(--color-fg-muted)] mb-2">
              Available substitution variables
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUBSTITUTION_VARS.map((v) => (
                <code
                  key={v}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)]
                             border border-[var(--color-border)] text-[var(--color-fg-muted)]"
                >
                  {v}
                </code>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700
                         text-white text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {pending && <Loader2Icon className="h-3 w-3 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create template'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-3 py-1.5 rounded-md border border-[var(--color-border)]
                         text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                         hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template row with inline delete confirm
// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  onEdit,
  onDeleted,
}: {
  template: EmailTemplate
  onEdit: (t: EmailTemplate) => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteEmailTemplate(template.id)
      if (result.success) {
        onDeleted()
      } else {
        setDeleteError(result.error)
        setConfirming(false)
      }
    })
  }

  const isDefault = template.isDefault

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Left: name + category + default pill */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--color-fg)] truncate">
              {template.name}
            </span>
            <CategoryBadge category={template.category as EmailTemplateCategory} />
            {isDefault && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold
                               bg-[var(--color-bg-input)] border border-[var(--color-border)]
                               text-[var(--color-fg-subtle)]">
                Default
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-fg-subtle)] truncate">
            {template.subject}
          </p>
          {deleteError && (
            <p className="mt-1 text-xs text-red-400">{deleteError}</p>
          )}
        </div>

        {/* Right: edit + delete */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(template)}
            disabled={pending}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)]
                       text-[var(--color-fg-muted)] text-xs hover:text-[var(--color-fg)]
                       hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
            aria-label={`Edit template ${template.name}`}
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </button>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending || isDefault}
              title={isDefault ? 'Cannot delete a default template' : undefined}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-red-800
                         text-red-400 text-xs hover:bg-red-950 disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors"
              aria-label={`Delete template ${template.name}`}
            >
              <TrashIcon className="h-3 w-3" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-red-950 border border-red-800 px-3 py-1.5">
              <span className="text-xs text-red-400">Delete?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {pending ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function EmailTemplatesPanel({ initial, currentUserRole }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initial)
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedSuccess, setSeedSuccess] = useState(false)
  const [seedPending, startSeedTransition] = useTransition()
  const router = useRouter()

  const isAdmin = currentUserRole === 'admin'

  const refresh = () => {
    router.refresh()
  }

  const handleSaved = () => {
    setModal(null)
    refresh()
  }

  const handleDeleted = () => {
    refresh()
  }

  const handleSeed = () => {
    setSeedError(null)
    setSeedSuccess(false)
    startSeedTransition(async () => {
      const result = await seedTemplatesForCurrentTenant()
      if (result.success) {
        setSeedSuccess(true)
        setTimeout(() => setSeedSuccess(false), 3000)
        refresh()
      } else {
        setSeedError(result.error)
      }
    })
  }

  // Keep local templates in sync when router.refresh delivers new props
  // (next.js will re-render parent and pass fresh initial — but since we store
  // local state, we derive from props only on initial mount. For mutations we
  // call router.refresh() which will re-render the server component parent.)

  return (
    <>
      {modal && (
        <TemplateModal
          mode={modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      <section
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
        aria-labelledby="email-templates-heading"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <MailIcon className="h-4 w-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
            <h2 id="email-templates-heading" className="text-lg font-semibold text-[var(--color-fg)]">
              Email templates
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleSeed}
                disabled={seedPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)]
                           text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]
                           hover:bg-[var(--color-bg-input)] disabled:opacity-50 transition-colors"
                title="Seed default templates for this tenant"
              >
                {seedPending
                  ? <Loader2Icon className="h-3 w-3 animate-spin" />
                  : <SparklesIcon className="h-3 w-3" />
                }
                Seed defaults
              </button>
            )}
            <button
              type="button"
              onClick={() => setModal({ type: 'create' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700
                         text-white text-xs font-medium transition-colors"
            >
              <PlusIcon className="h-3 w-3" />
              Create template
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--color-fg-subtle)] mb-4">
          Reusable templates for candidate communications. Default templates can be edited
          but not deleted. Use substitution variables to personalise each message.
        </p>

        {seedSuccess && (
          <p className="mb-3 text-xs text-emerald-400" role="status" aria-live="polite">
            Default templates seeded successfully.
          </p>
        )}
        {seedError && (
          <p className="mb-3 text-xs text-red-400" role="alert">
            {seedError}
          </p>
        )}

        {/* Template list */}
        {templates.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-[var(--color-border)]
                        bg-[var(--color-bg-input)] px-5 py-6 text-center"
          >
            <p className="text-sm text-[var(--color-fg-subtle)]">No templates yet.</p>
            {isAdmin && (
              <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
                Click &quot;Seed defaults&quot; to add the built-in templates, or create one manually.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Email templates">
            {initial.map((tpl) => (
              <div key={tpl.id} role="listitem">
                <TemplateRow
                  template={tpl}
                  onEdit={(t) => setModal({ type: 'edit', template: t })}
                  onDeleted={handleDeleted}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
