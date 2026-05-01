'use client'

import { useActionState } from 'react'
import { LockIcon } from 'lucide-react'
import { updateAgency, archiveAgency } from '@/actions/agencies'
import type { Agency } from '@/db/schema/agencies'
import { AgencyLogoUpload } from './logo-upload'

interface Props {
  agency: Agency
}

export function AgencyEditForm({ agency }: Props) {
  const boundUpdate = updateAgency.bind(null, agency.id)
  const [state, action, pending] = useActionState(boundUpdate, null)

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6">
        <AgencyLogoUpload agencyId={agency.id} currentLogoPath={agency.logoPath ?? null} />
      </div>
      <form action={action} className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
        <h3 className="font-semibold text-[var(--color-fg)]">Agency details</h3>

        {state?.error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--color-fg)] mb-1" htmlFor="name">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={agency.name}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-fg)] mb-1" htmlFor="contactEmail">
            Contact email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={agency.contactEmail ?? ''}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-fg)] mb-1" htmlFor="contactPhone">
            Contact phone
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            defaultValue={agency.contactPhone ?? ''}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-fg)] mb-1" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={agency.notes ?? ''}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2
                     hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <ArchiveButton agencyId={agency.id} isSystem={agency.isSystem ?? false} />
    </div>
  )
}

function ArchiveButton({ agencyId, isSystem }: { agencyId: string; isSystem: boolean }) {
  if (isSystem) {
    return (
      <button
        type="button"
        disabled
        title="System agency — cannot be archived"
        className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)]
                   bg-[var(--color-bg-elevated)] text-[var(--color-fg-subtle)] text-sm font-medium px-4 py-2 cursor-not-allowed"
      >
        <LockIcon className="h-3.5 w-3.5" />
        Archive agency
      </button>
    )
  }

  const boundArchive = archiveAgency.bind(null, agencyId)
  return (
    <form action={boundArchive}>
      <button
        type="submit"
        className="w-full rounded-md border border-red-800 text-red-400 text-sm font-medium px-4 py-2
                   hover:bg-red-950 transition-colors"
        onClick={(e) => {
          if (!confirm('Archive this agency? Candidates will remain but the agency will be hidden.')) {
            e.preventDefault()
          }
        }}
      >
        Archive agency
      </button>
    </form>
  )
}
