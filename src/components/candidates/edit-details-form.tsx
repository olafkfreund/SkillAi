'use client'

import { useState, useActionState } from 'react'
import { Loader2, PencilIcon, ChevronDownIcon } from 'lucide-react'
import { updateCandidateDetails } from '@/actions/candidates'
import type { UpdateCandidateState } from '@/actions/candidates'

interface CandidateDetails {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  agencyId: string | null
}

interface Agency {
  id: string
  name: string
}

interface EditDetailsFormProps {
  candidate: CandidateDetails
  agencies: Agency[]
}

export function EditDetailsForm({ candidate, agencies }: EditDetailsFormProps) {
  const [isOpen, setIsOpen] = useState(false)

  const boundAction = updateCandidateDetails.bind(null, candidate.id)
  const [state, action, pending] = useActionState<UpdateCandidateState | null, FormData>(
    boundAction,
    null
  )

  const [fields, setFields] = useState({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email ?? '',
    phone: candidate.phone ?? '',
    agencyId: candidate.agencyId ?? '',
  })

  const fieldErrors = state && !state.success ? state.fieldErrors : {}

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <PencilIcon className="h-4 w-4 text-zinc-500" />
          <span className="font-semibold text-zinc-100">Edit Details</span>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <form
          action={(fd) => {
            fd.set('firstName', fields.firstName)
            fd.set('lastName', fields.lastName)
            fd.set('email', fields.email)
            fd.set('phone', fields.phone)
            fd.set('agencyId', fields.agencyId)
            action(fd)
          }}
          className="mt-5 space-y-4"
        >
          {state && !state.success && !state.fieldErrors && (
            <div
              role="alert"
              className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400"
            >
              {state.error}
            </div>
          )}

          {state?.success && (
            <div
              role="status"
              className="rounded-md bg-emerald-950 border border-emerald-800 px-4 py-3 text-sm text-emerald-400"
            >
              Details updated successfully.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300 mb-1">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                disabled={pending}
                value={fields.firstName}
                onChange={(e) => setFields((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              />
              {fieldErrors?.firstName && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.firstName[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-zinc-300 mb-1">
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                disabled={pending}
                value={fields.lastName}
                onChange={(e) => setFields((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              />
              {fieldErrors?.lastName && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.lastName[0]}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
              Email <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              disabled={pending}
              value={fields.email}
              onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
              placeholder="candidate@example.com"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50"
            />
            {fieldErrors?.email && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-zinc-300 mb-1">
              Phone <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              disabled={pending}
              value={fields.phone}
              onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+44 7700 900000"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50"
            />
          </div>

          {agencies.length > 0 && (
            <div>
              <label htmlFor="agencyId" className="block text-sm font-medium text-zinc-300 mb-1">
                Agency <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <select
                id="agencyId"
                name="agencyId"
                disabled={pending}
                value={fields.agencyId}
                onChange={(e) => setFields((f) => ({ ...f, agencyId: e.target.value }))}
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50"
              >
                <option value="">— No agency —</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                         font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Saving…' : 'Save details'}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
