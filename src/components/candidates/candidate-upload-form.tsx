'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { CvDropzone } from '@/components/upload/cv-dropzone'
import { createCandidate } from '@/actions/candidates'
import type { CreateCandidateState } from '@/actions/candidates'

type Agency = { id: string; name: string }
type Props = { roleId: string; agencies: Agency[] }

export function CandidateUploadForm({ roleId, agencies }: Props) {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [state, action, pending] = useActionState<CreateCandidateState | null, FormData>(
    createCandidate,
    null
  )

  useEffect(() => {
    if (state?.success) {
      router.push(`/dashboard/candidates/${state.candidateId}?roleId=${roleId}`)
    }
  }, [state, router, roleId])

  const uploadState = submitting
    ? { status: 'uploading' as const }
    : state?.success
      ? { status: 'success' as const }
      : selectedFile
        ? { status: 'selected' as const, file: selectedFile }
        : { status: 'idle' as const }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!selectedFile) {
      e.preventDefault()
      return
    }
    setSubmitting(true)
  }

  const fieldErrors = state && !state.success ? state.fieldErrors : {}
  const globalError = state && !state.success && !state.fieldErrors ? state.error : null

  return (
    <form
      action={(formData) => {
        if (selectedFile) formData.set('cvFile', selectedFile)
        setSubmitting(true)
        action(formData)
      }}
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      {globalError && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* Hidden role id */}
      <input type="hidden" name="roleId" value={roleId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            disabled={pending}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {fieldErrors?.firstName && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            disabled={pending}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          disabled={pending}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {agencies.length > 0 && (
        <div>
          <label htmlFor="agencyId" className="block text-sm font-medium text-slate-700 mb-1">
            Agency
          </label>
          <select
            id="agencyId"
            name="agencyId"
            disabled={pending}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">— No agency —</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          CV file <span className="text-red-500">*</span>
        </label>
        <CvDropzone
          onFileSelect={setSelectedFile}
          uploadState={uploadState}
          disabled={pending}
        />
      </div>

      <button
        type="submit"
        disabled={pending || !selectedFile}
        className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                   font-medium px-5 py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Uploading…' : 'Upload & score'}
      </button>
    </form>
  )
}
