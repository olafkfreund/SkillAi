'use client'

import { useActionState } from 'react'
import { updateAgency, archiveAgency } from '@/actions/agencies'
import type { Agency } from '@/db/schema/agencies'

interface Props {
  agency: Agency
}

export function AgencyEditForm({ agency }: Props) {
  const boundUpdate = updateAgency.bind(null, agency.id)
  const [state, action, pending] = useActionState(boundUpdate, null)

  return (
    <div className="space-y-4">
      <form action={action} className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
        <h3 className="font-semibold text-zinc-100">Agency details</h3>

        {state?.error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="name">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={agency.name}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="contactEmail">
            Contact email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={agency.contactEmail ?? ''}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="contactPhone">
            Contact phone
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            defaultValue={agency.contactPhone ?? ''}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={agency.notes ?? ''}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
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

      <ArchiveButton agencyId={agency.id} />
    </div>
  )
}

function ArchiveButton({ agencyId }: { agencyId: string }) {
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
