'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { updateRole } from '@/actions/roles'
import type { UpdateRoleState } from '@/actions/roles'
import { ChipInput } from '@/components/ui/chip-input'
import { FrameworkLevelField } from './framework-level-field'

interface RoleData {
  id: string
  title: string
  description: string
  requirements: string
  customerId: string | null
  customerRoleId?: string | null
  frameworkLevelId?: string | null
  frameworkLevelLabel?: string | null
  country?: string | null
  city?: string | null
  workMode?: 'remote' | 'hybrid' | 'onsite' | null
  languageRequirements?: string[] | null
  targetFillDate?: string | null
  cutoffDate?: string | null
  customerPortalPath?: string | null
  customerDayRate?: string | null
  rateCurrency?: string | null
  priorityKeywords?: string[] | null
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
  customerRoleIdLabels?: Record<string, string>
}

export function RoleEditForm({ role, customers = [], frameworks = {}, customerRoleIdLabels = {} }: RoleEditFormProps) {
  const router = useRouter()

  const boundAction = updateRole.bind(null, role.id)
  const [state, action, pending] = useActionState<UpdateRoleState | null, FormData>(
    boundAction,
    null
  )

  const [fields, setFields] = useState<{
    title: string
    description: string
    requirements: string
    customerId: string
    customerRoleId: string
    frameworkLevelId: string
    frameworkLevelLabel: string
    country: string
    city: string
    workMode: string
    languageRequirements: string
    targetFillDate: string
    cutoffDate: string
    customerPortalPath: string
    customerDayRate: string
    rateCurrency: string
    priorityKeywords: string[]
  }>({
    title: role.title,
    description: role.description,
    requirements: role.requirements,
    customerId: role.customerId ?? '',
    customerRoleId: role.customerRoleId ?? '',
    frameworkLevelId: role.frameworkLevelId ?? '',
    frameworkLevelLabel: role.frameworkLevelLabel ?? '',
    country: role.country ?? '',
    city: role.city ?? '',
    workMode: role.workMode ?? '',
    languageRequirements: (role.languageRequirements ?? []).join(', '),
    targetFillDate: role.targetFillDate ?? '',
    cutoffDate: role.cutoffDate ?? '',
    customerPortalPath: role.customerPortalPath ?? '',
    customerDayRate: role.customerDayRate ?? '',
    rateCurrency: role.rateCurrency ?? '',
    priorityKeywords: role.priorityKeywords ?? [],
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
        fd.set('customerRoleId', fields.customerRoleId)
        fd.set('frameworkLevelId', fields.frameworkLevelId)
        fd.set('frameworkLevelLabel', fields.frameworkLevelLabel)
        fd.set('country', fields.country)
        fd.set('city', fields.city)
        fd.set('workMode', fields.workMode)
        fd.set('languageRequirements', fields.languageRequirements)
        fd.set('targetFillDate', fields.targetFillDate)
        fd.set('cutoffDate', fields.cutoffDate)
        fd.set('customerPortalPath', fields.customerPortalPath)
        fd.set('customerDayRate', fields.customerDayRate)
        fd.set('rateCurrency', fields.rateCurrency)
        fd.set('priorityKeywords', JSON.stringify(fields.priorityKeywords))
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
                // Reset customer-scoped role ID when customer changes
                customerRoleId: '',
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

      {fields.customerId && (
        <div>
          <label htmlFor="customerRoleId" className="block text-sm font-medium text-zinc-300 mb-1">
            {customerRoleIdLabels[fields.customerId] ?? 'Customer Role ID'}{' '}
            <span className="text-zinc-500 font-normal">(optional)</span>
          </label>
          <input
            id="customerRoleId"
            name="customerRoleId"
            type="text"
            maxLength={100}
            disabled={pending}
            value={fields.customerRoleId}
            onChange={(e) => setFields((f) => ({ ...f, customerRoleId: e.target.value }))}
            placeholder="e.g. JOB-12345"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-zinc-500">
            The customer&apos;s identifier for this role.
          </p>
          {fieldErrors?.customerRoleId && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.customerRoleId[0]}</p>
          )}
        </div>
      )}

      <FrameworkLevelField
        customerId={fields.customerId}
        levels={frameworks[fields.customerId] ?? []}
        value={{ id: fields.frameworkLevelId, label: fields.frameworkLevelLabel }}
        onChange={(next) =>
          setFields((f) => ({
            ...f,
            frameworkLevelId: next.id,
            frameworkLevelLabel: next.label,
          }))
        }
        disabled={pending}
      />

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

      {/* Manager Priorities */}
      <div className="border-t border-zinc-800 pt-4 mt-2">
        <label htmlFor="priorityKeywords" className="block text-sm font-medium text-zinc-300 mb-1">
          Manager Priorities <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <p id="priorityKeywords-help" className="text-xs text-zinc-500 mb-2">
          Soft-signal phrases the hiring manager wants prioritised. E.g.{' '}
          <span className="text-zinc-400">&quot;Self-starting&quot;</span>,{' '}
          <span className="text-zinc-400">&quot;Engineer who codes&quot;</span>.
        </p>
        <ChipInput
          id="priorityKeywords"
          aria-describedby="priorityKeywords-help"
          value={fields.priorityKeywords}
          onChange={(next) => setFields((f) => ({ ...f, priorityKeywords: next }))}
          placeholder="Type a phrase, press Enter…"
          maxChips={15}
          maxLength={120}
          disabled={pending}
        />
        {fieldErrors?.priorityKeywords && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.priorityKeywords[0]}</p>
        )}
      </div>

      {/* Location & Language */}
      <div className="border-t border-zinc-800 pt-4 mt-2">
        <p className="text-sm font-medium text-zinc-400 mb-3">Location & Language</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="country" className="block text-xs font-medium text-zinc-400 mb-1">Country</label>
            <input
              id="country"
              name="country"
              type="text"
              disabled={pending}
              value={fields.country}
              onChange={(e) => setFields((f) => ({ ...f, country: e.target.value }))}
              placeholder="United Kingdom"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="city" className="block text-xs font-medium text-zinc-400 mb-1">City</label>
            <input
              id="city"
              name="city"
              type="text"
              disabled={pending}
              value={fields.city}
              onChange={(e) => setFields((f) => ({ ...f, city: e.target.value }))}
              placeholder="London"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="workMode" className="block text-xs font-medium text-zinc-400 mb-1">Work Mode</label>
            <select
              id="workMode"
              name="workMode"
              disabled={pending}
              value={fields.workMode}
              onChange={(e) => setFields((f) => ({ ...f, workMode: e.target.value }))}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">— Not specified —</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div>
            <label htmlFor="languageRequirements" className="block text-xs font-medium text-zinc-400 mb-1">
              Language Requirements <span className="text-zinc-600">(comma-separated)</span>
            </label>
            <input
              id="languageRequirements"
              name="languageRequirements"
              type="text"
              disabled={pending}
              value={fields.languageRequirements}
              onChange={(e) => setFields((f) => ({ ...f, languageRequirements: e.target.value }))}
              placeholder="English, German"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Budget */}
      <div className="border-t border-zinc-800 pt-4 mt-2">
        <p className="text-sm font-medium text-zinc-400 mb-3">Budget</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="customerDayRate" className="block text-sm font-medium text-zinc-300 mb-1">
              Customer Day Rate
            </label>
            <input
              id="customerDayRate"
              name="customerDayRate"
              type="number"
              step="0.01"
              min="0"
              disabled={pending}
              value={fields.customerDayRate}
              onChange={(e) => setFields((f) => ({ ...f, customerDayRate: e.target.value }))}
              placeholder="850.00"
              className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-500">Budget the client pays per day for this role.</p>
          </div>
          <div>
            <label htmlFor="rateCurrency" className="block text-sm font-medium text-zinc-300 mb-1">
              Currency
            </label>
            <select
              id="rateCurrency"
              name="rateCurrency"
              disabled={pending}
              value={fields.rateCurrency}
              onChange={(e) => setFields((f) => ({ ...f, rateCurrency: e.target.value }))}
              className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">—</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        {fieldErrors?.rateCurrency && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.rateCurrency[0]}</p>
        )}
      </div>

      {/* Deadlines & Customer Portal */}
      <div className="border-t border-zinc-800 pt-4 mt-2">
        <p className="text-sm font-medium text-zinc-300 mb-3">Deadlines & Customer Portal</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="targetFillDate" className="block text-xs font-medium text-zinc-400 mb-1">
              Target Fill Date <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              id="targetFillDate"
              name="targetFillDate"
              type="date"
              disabled={pending}
              value={fields.targetFillDate}
              onChange={(e) => setFields((f) => ({ ...f, targetFillDate: e.target.value }))}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="cutoffDate" className="block text-xs font-medium text-zinc-400 mb-1">
              Cut-off Date <span className="text-zinc-600">(absolute deadline)</span>
            </label>
            <input
              id="cutoffDate"
              name="cutoffDate"
              type="date"
              disabled={pending}
              value={fields.cutoffDate}
              onChange={(e) => setFields((f) => ({ ...f, cutoffDate: e.target.value }))}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
        {fields.customerId && (
          <div>
            <label htmlFor="customerPortalPath" className="block text-xs font-medium text-zinc-400 mb-1">
              Customer Portal Path <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              id="customerPortalPath"
              name="customerPortalPath"
              type="text"
              disabled={pending}
              value={fields.customerPortalPath}
              onChange={(e) => setFields((f) => ({ ...f, customerPortalPath: e.target.value }))}
              placeholder="/jobs/12345"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Path on the customer&apos;s portal for this role. Combined with the customer&apos;s base URL.
            </p>
          </div>
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
