'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createAgency } from '@/actions/agencies'

export default function NewAgencyPage() {
  const [state, action, pending] = useActionState(createAgency, null)

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/dashboard/agencies" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to agencies
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-2">Add agency</h1>
      </div>

      <form action={action} className="space-y-5 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        {state?.error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="name">
            Agency name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. TechSearch Partners"
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
            placeholder="contact@agency.com"
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
            placeholder="+1 (555) 000-0000"
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
            rows={3}
            placeholder="Specialisations, terms, performance history..."
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2
                       hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Saving…' : 'Save agency'}
          </button>
          <Link
            href="/dashboard/agencies"
            className="rounded-md border border-zinc-600 text-zinc-300 text-sm font-medium
                       px-4 py-2 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
