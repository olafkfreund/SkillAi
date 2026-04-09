'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { updateRole } from '@/actions/roles'
import type { UpdateRoleState } from '@/actions/roles'

interface RoleData {
  id: string
  title: string
  description: string
  requirements: string
  customerId: string | null
  frameworkLevelId?: string | null
  frameworkLevelLabel?: string | null
}

type FrameworkLevelOption = {
  id: string
  code: string
  title: string
  description: string
  order: number
}

interface RoleEditFormProps {
  role: RoleData
  customers?: Array<{ id: string; name: string }>
  frameworks?: Record<string, FrameworkLevelOption[]>
}

export function RoleEditForm({ role, customers = [], frameworks = {} }: RoleEditFormProps) {
  const router = useRouter()

  const boundAction = updateRole.bind(null, role.id)
  const [state, action, pending] = useActionState<UpdateRoleState | null, FormData>(
    boundAction,
    null
  )

  const [fields, setFields] = useState({
    title: role.title,
    description: role.description,
    requirements: role.requirements,
    customerId: role.customerId ?? '',
    frameworkLevelId: role.frameworkLevelId ?? '',
    frameworkLevelLabel: role.frameworkLevelLabel ?? '',
  })

  useEffect(() => {
    if (state?.success) {
      router.push(`/dashboard/roles/${role.id}`)
    }
  }, [state, router, role.id])

  const fieldErrors = state && !state.success ? state.fieldErrors : {}

  return (
    <form
      action={(fd) => {
        fd.set('title', fields.title)
        fd.set('description', fields.description)
        fd.set('requirements', fields.requirements)
        fd.set('customerId', fields.customerId)
        fd.set('frameworkLevelId', fields.frameworkLevelId)
        fd.set('frameworkLevelLabel', fields.frameworkLevelLabel)
        action(fd)
      }}
      className="space-y-6 max-w-2xl"
    >
      {state && !state.success && !state.fieldErrors && (
        <div
          role="alert"
          className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400"
        >
          {state.error}
        </div>
      )}

      {customers.length > 0 && (
        <div>
          <label htmlFor="customerId" className="block text-sm font-medium text-zinc-300 mb-1">
            Customer
          </label>
          <select
            id="customerId"
            name="customerId"
            disabled={pending}
            value={fields.customerId}
            onChange={(e) => {
              const newCustomerId = e.target.value
              setFields((f) => ({
                ...f,
                customerId: newCustomerId,
                // Reset framework selection when customer changes
                frameworkLevelId: '',
                frameworkLevelLabel: '',
              }))
            }}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50"
          >
            <option value="">No customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {fields.customerId && (frameworks[fields.customerId]?.length ?? 0) > 0 && (
        <div>
          <label htmlFor="frameworkLevelId" className="block text-sm font-medium text-zinc-300 mb-1">
            Framework Level <span className="text-zinc-500 font-normal">(optional)</span>
          </label>
          <select
            id="frameworkLevelId"
            name="frameworkLevelId"
            disabled={pending}
            value={fields.frameworkLevelId}
            onChange={(e) => {
              const level = frameworks[fields.customerId]?.find((l) => l.id === e.target.value)
              setFields((f) => ({
                ...f,
                frameworkLevelId: e.target.value,
                frameworkLevelLabel: level ? `${level.code} — ${level.title}` : '',
              }))
            }}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50"
          >
            <option value="">Select band level…</option>
            {[...(frameworks[fields.customerId] ?? [])].sort((a, b) => a.order - b.order).map((level) => (
              <option key={level.id} value={level.id}>
                {level.code} — {level.title}
              </option>
            ))}
          </select>
          {fields.frameworkLevelId && (
            <p className="text-xs text-zinc-500 mt-1">
              {frameworks[fields.customerId]?.find((l) => l.id === fields.frameworkLevelId)?.description}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1">
          Role title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          disabled={pending}
          value={fields.title}
          onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                     placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50"
        />
        {fieldErrors?.title && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.title[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-zinc-300 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          disabled={pending}
          value={fields.description}
          onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                     placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 resize-y"
        />
        {fieldErrors?.description && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.description[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="requirements" className="block text-sm font-medium text-zinc-300 mb-1">
          Requirements <span className="text-red-500">*</span>
        </label>
        <textarea
          id="requirements"
          name="requirements"
          rows={6}
          required
          disabled={pending}
          value={fields.requirements}
          onChange={(e) => setFields((f) => ({ ...f, requirements: e.target.value }))}
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                     placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 resize-y"
        />
        {fieldErrors?.requirements && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.requirements[0]}</p>
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
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <a
          href={`/dashboard/roles/${role.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
