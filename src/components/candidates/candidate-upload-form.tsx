'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { CvDropzone } from '@/components/upload/cv-dropzone'
import { createCandidate } from '@/actions/candidates'
import type { CreateCandidateState } from '@/actions/candidates'

type Agency = { id: string; name: string }
type Props = { roleId: string; agencies: Agency[] }

interface ExtractedCandidate {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  linkedin?: string
  currentTitle?: string
  summary?: string
}

export function CandidateUploadForm({ roleId, agencies }: Props) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedCandidate | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  // Controlled form field values — populated by AI extraction
  const [fields, setFields] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: '',
    city: '',
    languagesSpoken: '',
    willingToRelocate: '',
    candidateRate: '',
    customerRate: '',
    rateCurrency: 'GBP',
  })

  const [state, action, pending] = useActionState<CreateCandidateState | null, FormData>(
    createCandidate,
    null
  )

  useEffect(() => {
    if (state?.success) {
      router.push(`/dashboard/candidates/${state.candidateId}?roleId=${roleId}`)
    }
  }, [state, router, roleId])

  async function handleFileSelect(file: File) {
    setSelectedFile(file)
    setExtractError(null)
    setExtracted(null)
    setExtracting(true)

    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/extract/candidate', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Extraction failed')
      const data: ExtractedCandidate = await res.json()

      setExtracted(data)
      setFields((f) => ({
        ...f,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
      }))
    } catch {
      setExtractError('Could not auto-fill from file — please fill in manually.')
    } finally {
      setExtracting(false)
    }
  }

  const uploadState = submitting
    ? { status: 'uploading' as const }
    : state?.success
      ? { status: 'success' as const }
      : selectedFile
        ? { status: 'selected' as const, file: selectedFile }
        : { status: 'idle' as const }

  const fieldErrors = state && !state.success ? state.fieldErrors : {}
  const globalError = state && !state.success && !state.fieldErrors ? state.error : null

  return (
    <form
      action={(formData) => {
        if (selectedFile) formData.set('cvFile', selectedFile)
        setSubmitting(true)
        action(formData)
      }}
      className="space-y-5"
    >
      {globalError && (
        <div role="alert" className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {globalError}
        </div>
      )}

      <input type="hidden" name="roleId" value={roleId} />

      {/* CV upload — top of form so extraction happens before user fills fields */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-fg)] mb-2">
          CV file <span className="text-red-500">*</span>
        </label>
        <CvDropzone
          onFileSelect={handleFileSelect}
          uploadState={uploadState}
          disabled={pending}
        />
        {extracting && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-400">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Reading CV and filling in details…
          </p>
        )}
        {extracted && !extracting && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Details filled from CV — review and adjust below
          </p>
        )}
        {extractError && (
          <p className="mt-2 text-xs text-amber-400">{extractError}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            disabled={pending || extracting}
            value={fields.firstName}
            onChange={(e) => setFields((f) => ({ ...f, firstName: e.target.value }))}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {fieldErrors?.firstName && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.firstName[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            disabled={pending || extracting}
            value={fields.lastName}
            onChange={(e) => setFields((f) => ({ ...f, lastName: e.target.value }))}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       placeholder:text-[var(--color-fg-subtle)]
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          disabled={pending || extracting}
          value={fields.email}
          onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                     placeholder:text-[var(--color-fg-subtle)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          disabled={pending || extracting}
          value={fields.phone}
          onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                     placeholder:text-[var(--color-fg-subtle)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {agencies.length > 0 && (
        <div>
          <label htmlFor="agencyId" className="block text-sm font-medium text-[var(--color-fg)] mb-1">
            Agency
          </label>
          <select
            id="agencyId"
            name="agencyId"
            disabled={pending}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">— No agency —</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Location & Language */}
      <div className="border-t border-[var(--color-bg-input)] pt-4 mt-2">
        <p className="text-sm font-medium text-[var(--color-fg-muted)] mb-3">Location & Language (optional)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="country" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Country</label>
            <input
              id="country"
              name="country"
              type="text"
              value={fields.country}
              onChange={(e) => setFields((f) => ({ ...f, country: e.target.value }))}
              disabled={pending}
              placeholder="United Kingdom"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="city" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">City</label>
            <input
              id="city"
              name="city"
              type="text"
              value={fields.city}
              onChange={(e) => setFields((f) => ({ ...f, city: e.target.value }))}
              disabled={pending}
              placeholder="London"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="languagesSpoken" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              Languages <span className="text-[var(--color-fg-subtle)]">(comma-separated)</span>
            </label>
            <input
              id="languagesSpoken"
              name="languagesSpoken"
              type="text"
              value={fields.languagesSpoken}
              onChange={(e) => setFields((f) => ({ ...f, languagesSpoken: e.target.value }))}
              disabled={pending}
              placeholder="English, German"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="willingToRelocate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Willing to Relocate</label>
            <select
              id="willingToRelocate"
              name="willingToRelocate"
              value={fields.willingToRelocate}
              onChange={(e) => setFields((f) => ({ ...f, willingToRelocate: e.target.value }))}
              disabled={pending}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">— Not specified —</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
      </div>

      {/* Commercial Details */}
      <div className="border-t border-[var(--color-bg-input)] pt-4 mt-2">
        <p className="text-sm font-medium text-[var(--color-fg-muted)] mb-3">Commercial Details (optional)</p>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="candidateRate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              Candidate Rate/day
            </label>
            <input
              id="candidateRate"
              name="candidateRate"
              type="number"
              step="0.01"
              min="0"
              value={fields.candidateRate}
              onChange={(e) => setFields((f) => ({ ...f, candidateRate: e.target.value }))}
              disabled={pending}
              placeholder="650.00"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="customerRate" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              Customer Rate/day
            </label>
            <input
              id="customerRate"
              name="customerRate"
              type="number"
              step="0.01"
              min="0"
              value={fields.customerRate}
              onChange={(e) => setFields((f) => ({ ...f, customerRate: e.target.value }))}
              disabled={pending}
              placeholder="850.00"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="rateCurrency" className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              Currency
            </label>
            <select
              id="rateCurrency"
              name="rateCurrency"
              value={fields.rateCurrency}
              onChange={(e) => setFields((f) => ({ ...f, rateCurrency: e.target.value }))}
              disabled={pending}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-fg)] px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="CHF">CHF</option>
              <option value="SEK">SEK</option>
              <option value="NOK">NOK</option>
              <option value="DKK">DKK</option>
            </select>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || !selectedFile || extracting}
        className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                   font-medium px-5 py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Uploading…' : 'Upload & score'}
      </button>
    </form>
  )
}
