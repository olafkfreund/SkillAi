'use client'

import { useActionState } from 'react'
import { updateCustomer, archiveCustomer } from '@/actions/customers'
import type { Customer } from '@/db/schema/customers'

interface Props {
  customer: Customer
  isAdmin: boolean
}

export function CustomerEditForm({ customer, isAdmin }: Props) {
  const boundUpdate = updateCustomer.bind(null, customer.id)
  const [state, action, pending] = useActionState(boundUpdate, null)

  return (
    <div className="space-y-4">
      <form action={action} className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 space-y-4">
        <h3 className="font-semibold text-zinc-100">Customer details</h3>

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
            defaultValue={customer.name}
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
            defaultValue={customer.contactName ?? ''}
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
            defaultValue={customer.contactEmail ?? ''}
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
            defaultValue={customer.contactPhone ?? ''}
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
            defaultValue={customer.website ?? ''}
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
            defaultValue={customer.notes ?? ''}
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

      {isAdmin && <ArchiveButton customerId={customer.id} />}
    </div>
  )
}

function ArchiveButton({ customerId }: { customerId: string }) {
  const boundArchive = archiveCustomer.bind(null, customerId)
  return (
    <form action={boundArchive}>
      <button
        type="submit"
        className="w-full rounded-md border border-red-800 text-red-400 text-sm font-medium px-4 py-2
                   hover:bg-red-950 transition-colors"
        onClick={(e) => {
          if (!confirm('Archive this customer? Linked roles will remain but the customer will be hidden.')) {
            e.preventDefault()
          }
        }}
      >
        Archive customer
      </button>
    </form>
  )
}
