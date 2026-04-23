'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DownloadIcon, UploadIcon, FileTextIcon, XIcon, Loader2Icon } from 'lucide-react'
import { CvDropzone } from '@/components/upload/cv-dropzone'

type Props = {
  candidateId: string
  filePath: string | null
  fileType: string | null
}

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | { status: 'uploading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

type Feedback = { ok: boolean; message: string } | null

export function CvFilePanel({ candidateId, filePath, fileType }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })
  const [feedback, setFeedback] = useState<Feedback>(null)

  const openModal = () => {
    setUploadState({ status: 'idle' })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setUploadState({ status: 'idle' })
  }

  // Close on Escape key
  useEffect(() => {
    if (!modalOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const showFeedback = (ok: boolean, message: string) => {
    setFeedback({ ok, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleFileSelect = useCallback((file: File) => {
    setUploadState({ status: 'selected', file })
  }, [])

  const handleUpload = async () => {
    if (uploadState.status !== 'selected') return

    const file = uploadState.file
    setUploadState({ status: 'uploading' })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/candidates/${candidateId}/cv`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error ?? `Upload failed (${res.status})`
        setUploadState({ status: 'error', message: msg })
        return
      }

      setUploadState({ status: 'success' })
      showFeedback(true, filePath ? 'CV replaced successfully' : 'CV attached successfully')

      // Brief pause so the success state in the dropzone is visible, then close + refresh
      setTimeout(() => {
        closeModal()
        router.refresh()
      }, 800)
    } catch {
      const msg = 'Network error — please try again'
      setUploadState({ status: 'error', message: msg })
    }
  }

  return (
    <>
      {/* ── Panel row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {filePath ? (
          <>
            {/* Download link */}
            <a
              href={`/api/candidates/${candidateId}/cv`}
              download
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800
                         text-zinc-400 text-xs font-medium px-3 py-1.5
                         hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download original CV
            </a>

            {/* File-type badge */}
            {fileType && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700
                               text-zinc-400 text-xs font-medium px-2 py-0.5">
                <FileTextIcon className="h-3 w-3" />
                {fileType.toUpperCase()}
              </span>
            )}

            {/* Replace button */}
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800
                         text-zinc-400 text-xs font-medium px-3 py-1.5
                         hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Replace…
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-zinc-500 italic">No original file on record</span>
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800
                         text-zinc-400 text-xs font-medium px-3 py-1.5
                         hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Attach CV
            </button>
          </>
        )}

        {/* Inline feedback message */}
        {feedback && (
          <span
            className={`text-xs font-medium ${feedback.ok ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {feedback.ok ? `\u2713 ${feedback.message}` : feedback.message}
          </span>
        )}
      </div>

      {/* ── Modal overlay ─────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="relative bg-zinc-950 border border-zinc-700 rounded-xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-zinc-100">
                {filePath ? 'Replace original CV' : 'Attach original CV'}
              </h3>
              <button
                onClick={closeModal}
                className="text-zinc-500 hover:text-zinc-300 transition-colors rounded-md p-1 hover:bg-zinc-800"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Dropzone */}
            <CvDropzone onFileSelect={handleFileSelect} uploadState={uploadState} />

            {/* Upload button — only shown once a file is selected */}
            {uploadState.status === 'selected' && (
              <button
                onClick={handleUpload}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg
                           bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium
                           px-4 py-2.5 transition-colors"
              >
                <UploadIcon className="h-4 w-4" />
                {filePath ? 'Replace CV' : 'Attach CV'}
              </button>
            )}

            {uploadState.status === 'uploading' && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Uploading…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
