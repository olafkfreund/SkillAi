'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createCustomer } from '@/actions/customers'

export default function NewCustomerPage() {
  const [state, action, pending] = useActionState(createCustomer, null)

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/dashboard/customers" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to customers
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-2">Add customer</h1>
      </div>

      <form action={action} className="space-y-5 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        {state?.error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="name">
            Company name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Acme Corp"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {state?.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-400">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="contactName">
            Contact name
          </label>
          <input
            id="contactName"
            name="contactName"
            type="text"
            placeholder="e.g. Jane Smith"
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
            placeholder="jane@acmecorp.com"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {state?.fieldErrors?.contactEmail && (
            <p className="mt-1 text-xs text-red-400">{state.fieldErrors.contactEmail[0]}</p>
          )}
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
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="website">
            Website
          </label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://acmecorp.com"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="portalBaseUrl">
            Customer portal base URL
          </label>
          <input
            id="portalBaseUrl"
            name="portalBaseUrl"
            type="url"
            placeholder="https://jobs.acmecorp.com"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Used as the base URL for per-role portal links.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="roleIdLabel">
            Role ID label
          </label>
          <input
            id="roleIdLabel"
            name="roleIdLabel"
            type="text"
            maxLength={60}
            placeholder="e.g. CtoolId"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Optional. The name your customer uses for their role identifiers (e.g. CtoolId, Job Number, Req ID).
            Leave blank to use the default &ldquo;Customer Role ID&rdquo;.
          </p>
          {state?.fieldErrors?.roleIdLabel && (
            <p className="mt-1 text-xs text-red-400">{state.fieldErrors.roleIdLabel[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Industry, hiring context, preferences..."
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
            {pending ? 'Saving…' : 'Save customer'}
          </button>
          <Link
            href="/dashboard/customers"
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
