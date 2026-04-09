'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { createRole } from '@/actions/roles'
import type { CreateRoleState } from '@/actions/roles'

export function RoleForm() {
  const router = useRouter()
  const [state, action, pending] = useActionState<CreateRoleState | null, FormData>(
    createRole,
    null
  )

  useEffect(() => {
    if (state?.success) {
      router.push(`/dashboard/roles/${state.roleId}`)
    }
  }, [state, router])

  const fieldErrors = state && !state.success ? state.fieldErrors : {}

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {state && !state.success && !state.fieldErrors && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
          Role title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          disabled={pending}
          placeholder="e.g. Senior TypeScript Engineer"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50"
        />
        {fieldErrors?.title && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.title[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          disabled={pending}
          placeholder="Describe the role and responsibilities…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 resize-y"
        />
        {fieldErrors?.description && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.description[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="requirements" className="block text-sm font-medium text-slate-700 mb-1">
          Requirements <span className="text-red-500">*</span>
        </label>
        <textarea
          id="requirements"
          name="requirements"
          rows={6}
          required
          disabled={pending}
          placeholder="List the key requirements, one per line…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 resize-y"
        />
        {fieldErrors?.requirements && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.requirements[0]}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                     font-medium px-5 py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Creating…' : 'Create role'}
        </button>
        <a href="/dashboard/roles" className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </a>
      </div>
    </form>
  )
}
