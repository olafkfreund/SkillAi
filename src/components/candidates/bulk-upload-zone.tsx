'use client'

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react'
import Link from 'next/link'
import {
  UploadCloudIcon,
  ClockIcon,
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react'

type FileStatus = 'queued' | 'uploading' | 'done' | 'error'

interface FileItem {
  id: string
  file: File
  status: FileStatus
  candidateName?: string
  error?: string
}

interface Props {
  roleId: string
  agencyId?: string
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.odt', '.rtf', '.txt', '.md']
const ACCEPTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
]

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME.includes(file.type)) return true
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'queued')
    return <ClockIcon className="h-4 w-4 text-[var(--color-fg-subtle)] shrink-0" />
  if (status === 'uploading')
    return <Loader2Icon className="h-4 w-4 text-blue-400 shrink-0 animate-spin" />
  if (status === 'done')
    return <CheckCircleIcon className="h-4 w-4 text-emerald-400 shrink-0" />
  return <XCircleIcon className="h-4 w-4 text-red-400 shrink-0" />
}

export function BulkUploadZone({ roleId, agencyId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [done, setDone] = useState(false)

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return
    const newItems: FileItem[] = []
    for (const f of Array.from(incoming)) {
      if (!isAccepted(f)) continue
      newItems.push({ id: randomId(), file: f, status: 'queued' })
    }
    setFiles((prev) => [...prev, ...newItems])
    setDone(false)
  }, [])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files)
    // Reset so the same file can be re-added after removal
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const updateItem = (
    index: number,
    patch: Partial<Omit<FileItem, 'id' | 'file'>>
  ) => {
    setFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    )
  }

  const uploadOne = async (item: FileItem, index: number) => {
    updateItem(index, { status: 'uploading' })

    const fd = new FormData()
    fd.append('file', item.file)
    fd.append('roleId', roleId)
    if (agencyId) fd.append('agencyId', agencyId)

    try {
      const res = await fetch('/api/candidates/bulk-upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        updateItem(index, { status: 'done', candidateName: data.name })
      } else {
        updateItem(index, { status: 'error', error: data.error ?? 'Upload failed' })
      }
    } catch {
      updateItem(index, { status: 'error', error: 'Network error' })
    }
  }

  const uploadAll = async () => {
    setUploading(true)
    setDone(false)

    // Capture current snapshot so indices stay stable during sequential iteration
    const snapshot = [...files]
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i].status === 'queued') {
        await uploadOne(snapshot[i], i)
      }
    }

    setUploading(false)
    setDone(true)
  }

  const removeItem = (id: string) => {
    if (uploading) return
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const queued = files.filter((f) => f.status === 'queued').length
  const doneCount = files.filter((f) => f.status === 'done').length
  const errorCount = files.filter((f) => f.status === 'error').length
  const uploadingCount = files.filter((f) => f.status === 'uploading').length
  const total = files.length

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop CV files here or click to browse"
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
          'px-6 py-12 cursor-pointer select-none transition-colors',
          dragOver
            ? 'border-blue-500 bg-blue-950/30'
            : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-input)]/60',
          uploading ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        <UploadCloudIcon className="h-10 w-10 text-[var(--color-fg-subtle)]" />
        <p className="text-sm text-[var(--color-fg-muted)] text-center">
          <span className="font-medium text-[var(--color-fg)]">Click to browse</span> or drag and drop
          multiple CV files
        </p>
        <p className="text-xs text-[var(--color-fg-subtle)]">PDF, DOCX, ODT, RTF, TXT, MD &mdash; max 10 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleInputChange}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] divide-y divide-[var(--color-bg-input)] overflow-hidden"
          role="list"
          aria-label="CV files to upload"
        >
          {files.map((item, index) => (
            <div
              key={item.id}
              role="listitem"
              className="flex items-center gap-3 px-4 py-3"
            >
              <StatusIcon status={item.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-fg)] truncate">{item.file.name}</p>
                {item.status === 'done' && item.candidateName && (
                  <p className="text-xs text-emerald-400 truncate">{item.candidateName}</p>
                )}
                {item.status === 'error' && item.error && (
                  <p className="text-xs text-red-400 truncate">{item.error}</p>
                )}
                {item.status === 'queued' && (
                  <p className="text-xs text-[var(--color-fg-subtle)]">Queued</p>
                )}
                {item.status === 'uploading' && (
                  <p className="text-xs text-blue-400">Uploading&hellip;</p>
                )}
              </div>
              <span className="text-xs text-[var(--color-fg-subtle)] shrink-0">
                {(item.file.size / 1024).toFixed(0)} KB
              </span>
              {!uploading && item.status !== 'uploading' && (
                <button
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 text-[var(--color-fg-subtle)] hover:text-red-400 transition-colors"
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Progress counter */}
      {uploading && (
        <p className="text-sm text-[var(--color-fg-muted)]" aria-live="polite">
          {doneCount + errorCount} of {total} processed
          {uploadingCount > 0 && ' — uploading\u2026'}
        </p>
      )}

      {/* Done summary */}
      {done && !uploading && total > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--color-fg)]">
            <span className="font-medium text-emerald-400">{doneCount} uploaded</span>
            {errorCount > 0 && (
              <span className="text-red-400">, {errorCount} failed</span>
            )}
          </p>
          <Link
            href={`/dashboard/roles/${roleId}`}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2"
          >
            View candidates
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={uploadAll}
          disabled={uploading || queued === 0}
          aria-disabled={uploading || queued === 0}
          className="flex items-center gap-2 rounded-md bg-blue-600 text-white text-sm
                     font-medium px-5 py-2.5 hover:bg-blue-700 transition-colors
                     disabled:opacity-50 disabled:pointer-events-none"
        >
          {uploading ? (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Uploading&hellip;
            </>
          ) : (
            <>
              <UploadCloudIcon className="h-4 w-4" />
              {queued > 0 ? `Upload ${queued} file${queued !== 1 ? 's' : ''}` : 'Upload All'}
            </>
          )}
        </button>

        {files.length > 0 && !uploading && (
          <button
            type="button"
            onClick={() => {
              setFiles([])
              setDone(false)
            }}
            className="text-sm text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}
