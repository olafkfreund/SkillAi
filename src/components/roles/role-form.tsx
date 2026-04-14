'use client'

import { useState, useActionState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2, Sparkles, UploadCloud, X } from 'lucide-react'
import { createRole } from '@/actions/roles'
import type { CreateRoleState } from '@/actions/roles'

interface RoleFields {
  title: string
  description: string
  requirements: string
  customerId: string
  frameworkLevelId: string
  frameworkLevelLabel: string
  country: string
  city: string
  workMode: string
  languageRequirements: string
  targetFillDate: string
  cutoffDate: string
  customerPortalPath: string
}

type FrameworkLevelOption = {
  id: string
  code: string
  title: string
  description: string
  order: number
}

interface RoleFormProps {
  customers?: Array<{ id: string; name: string }>
  frameworks?: Record<string, FrameworkLevelOption[]>
}

export function RoleForm({ customers = [], frameworks = {} }: RoleFormProps) {
  const router = useRouter()
  const [state, action, pending] = useActionState<CreateRoleState | null, FormData>(
    createRole,
    null
  )

  const [fields, setFields] = useState<RoleFields>({
    title: '',
    description: '',
    requirements: '',
    customerId: '',
    frameworkLevelId: '',
    frameworkLevelLabel: '',
    country: '',
    city: '',
    workMode: '',
    languageRequirements: '',
    targetFillDate: '',
    cutoffDate: '',
    customerPortalPath: '',
  })

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [imported, setImported] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state?.success) {
      router.push(`/dashboard/roles/${state.roleId}`)
    }
  }, [state, router])

  async function handleFileImport(file: File) {
    setImportFile(file)
    setImportError(null)
    setImported(false)
    setImporting(true)

    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/extract/role', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Extraction failed')
      }
      const data = await res.json() as {
        title?: string; description?: string; requirements?: string; _warning?: string
      }

      setFields((f) => ({
        ...f,
        title: data.title ?? '',
        description: data.description ?? '',
        requirements: data.requirements ?? '',
      }))
      setImported(true)
      if (data._warning) setImportError(data._warning)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read file — please fill in manually.')
    } finally {
      setImporting(false)
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileImport(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileImport(file)
  }

  function clearImport() {
    setImportFile(null)
    setImported(false)
    setImportError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const fieldErrors = state && !state.success ? state.fieldErrors : {}

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Document import area */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className={`relative rounded-xl border-2 border-dashed px-6 py-5 transition-colors
          ${importing ? 'border-blue-500 bg-blue-950' : imported ? 'border-emerald-600 bg-emerald-950' : 'border-zinc-600 bg-zinc-800 hover:border-blue-500 hover:bg-blue-950/40'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleFileInput}
        />

        {importing ? (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Reading document and extracting role details…
          </div>
        ) : imported && importFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Sparkles className="h-4 w-4" />
              <span>Imported from <strong>{importFile.name}</strong> — fields filled below</span>
            </div>
            <button
              type="button"
              onClick={clearImport}
              className="text-zinc-500 hover:text-zinc-300 ml-3"
              title="Clear import"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <UploadCloud className="h-6 w-6 text-zinc-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-300">
                Import from document{' '}
                <span className="font-normal text-zinc-500">(optional)</span>
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Drop a PDF or DOCX job description here, or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-400 hover:underline"
                >
                  browse
                </button>
                . Fields will be auto-filled by AI.
              </p>
            </div>
          </div>
        )}

        {importError && (
          <p className="mt-2 text-xs text-red-400">{importError}</p>
        )}
      </div>

      {/* Role creation form */}
      <form action={(fd) => {
        // Inject controlled field values so they're always submitted
        fd.set('title', fields.title)
        fd.set('description', fields.description)
        fd.set('requirements', fields.requirements)
        fd.set('customerId', fields.customerId)
        fd.set('frameworkLevelId', fields.frameworkLevelId)
        fd.set('frameworkLevelLabel', fields.frameworkLevelLabel)
        action(fd)
      }} className="space-y-6">
        {state && !state.success && !state.fieldErrors && (
          <div role="alert" className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
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
              disabled={pending || importing}
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
              <option value="">Select customer…</option>
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
              disabled={pending || importing}
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
            disabled={pending || importing}
            value={fields.title}
            onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Senior TypeScript Engineer"
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
            disabled={pending || importing}
            value={fields.description}
            onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe the role and responsibilities…"
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
            disabled={pending || importing}
            value={fields.requirements}
            onChange={(e) => setFields((f) => ({ ...f, requirements: e.target.value }))}
            placeholder="List the key requirements, one per line…"
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 resize-y"
          />
          {fieldErrors?.requirements && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.requirements[0]}</p>
          )}
        </div>

        {/* Location & Language */}
        <div className="border-t border-zinc-800 pt-4 mt-2">
          <p className="text-sm font-medium text-zinc-400 mb-3">Location & Language</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
          <div className="grid grid-cols-2 gap-3">
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

        {/* Deadlines & Customer Portal */}
        <div className="border-t border-zinc-800 pt-4 mt-2">
          <p className="text-sm font-medium text-zinc-400 mb-3">Deadlines & Customer Portal</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
            disabled={pending || importing}
            className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                       font-medium px-5 py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? 'Creating…' : 'Create role'}
          </button>
          <a href="/dashboard/roles" className="text-sm text-zinc-500 hover:text-zinc-300">
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
