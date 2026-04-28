'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, UploadIcon, XIcon } from 'lucide-react'
import { removeCustomerLogo } from '@/actions/customer-logo'

interface Props {
  customerId: string
  currentLogoPath: string | null
}

export function CustomerLogoUpload({ customerId, currentLogoPath }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, startUpload] = useTransition()
  const [removing, startRemove] = useTransition()

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Please select a file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File exceeds 2 MB limit.')
      return
    }
    setError(null)
    startUpload(async () => {
      const fd = new FormData()
      fd.append('customerId', customerId)
      fd.append('file', file)
      const res = await fetch(`/api/customers/${customerId}/logo`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? 'Upload failed.')
        return
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    })
  }

  function handleRemove() {
    setError(null)
    startRemove(async () => {
      const result = await removeCustomerLogo(customerId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Customer logo</p>

      {/* Current logo preview + remove */}
      {currentLogoPath && (
        <div className="flex items-center gap-4">
          <img
            src={`/api/customers/${customerId}/logo`}
            alt="Customer logo"
            width={96}
            height={96}
            className="rounded-lg border border-zinc-700 bg-zinc-800 object-contain"
            style={{ width: 96, height: 96 }}
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-800 text-red-400
                       text-xs font-medium px-3 py-1.5 hover:bg-red-950 disabled:opacity-50
                       transition-colors"
          >
            {removing ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XIcon className="h-3.5 w-3.5" />
            )}
            Remove
          </button>
        </div>
      )}

      {/* Upload controls */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="block w-full text-sm text-zinc-400
                     file:mr-3 file:rounded file:border-0 file:bg-zinc-700
                     file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-200
                     file:cursor-pointer hover:file:bg-zinc-600"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white
                     text-xs font-medium px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50
                     transition-colors"
        >
          {uploading ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UploadIcon className="h-3.5 w-3.5" />
          )}
          Upload
        </button>
      </div>

      <p className="text-xs text-zinc-600">PNG, JPEG or WebP — max 2 MB</p>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
