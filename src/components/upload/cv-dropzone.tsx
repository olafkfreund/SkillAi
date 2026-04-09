'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, FileTextIcon, XCircleIcon, CheckCircleIcon, Loader2Icon } from 'lucide-react'

const ACCEPTED_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/rtf': ['.rtf'],
  'text/rtf': ['.rtf'],
  'text/plain': ['.txt', '.md'],
  'text/markdown': ['.md'],
}

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | { status: 'uploading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

type Props = {
  onFileSelect: (file: File) => void
  uploadState?: UploadState
  disabled?: boolean
}

export function CvDropzone({ onFileSelect, uploadState = { status: 'idle' }, disabled }: Props) {
  const [rejectionMsg, setRejectionMsg] = useState<string | null>(null)

  const onDrop = useCallback(
    (accepted: File[], rejected: import('react-dropzone').FileRejection[]) => {
      setRejectionMsg(null)

      if (rejected.length > 0) {
        const firstError = rejected[0].errors[0]
        if (firstError.code === 'file-too-large') {
          setRejectionMsg('File exceeds 10 MB limit.')
        } else if (firstError.code === 'file-invalid-type') {
          setRejectionMsg('Unsupported file type. Accepted: PDF, DOCX, ODT, RTF, TXT, MD.')
        } else {
          setRejectionMsg(firstError.message)
        }
        return
      }

      if (accepted.length > 0) {
        onFileSelect(accepted[0])
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    disabled: disabled || uploadState.status === 'uploading' || uploadState.status === 'success',
  })

  const isUploading = uploadState.status === 'uploading'
  const isSuccess = uploadState.status === 'success'
  const isError = uploadState.status === 'error'
  const isSelected = uploadState.status === 'selected'

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed
          px-6 py-10 text-center transition-colors cursor-pointer
          ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50'}
          ${isSuccess ? 'border-green-400 bg-green-50' : ''}
          ${isError ? 'border-red-300 bg-red-50' : ''}
          ${disabled || isUploading || isSuccess ? 'cursor-not-allowed opacity-60' : 'hover:border-blue-400 hover:bg-blue-50'}
        `}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <>
            <Loader2Icon className="h-10 w-10 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-700">Uploading…</p>
          </>
        ) : isSuccess ? (
          <>
            <CheckCircleIcon className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium text-green-700">Upload successful</p>
          </>
        ) : isSelected && uploadState.status === 'selected' ? (
          <>
            <FileTextIcon className="h-10 w-10 text-blue-500 mb-3" />
            <p className="text-sm font-medium text-slate-700">{uploadState.file.name}</p>
            <p className="text-xs text-slate-400 mt-1">
              {(uploadState.file.size / 1024).toFixed(1)} KB — ready to upload
            </p>
          </>
        ) : (
          <>
            <UploadCloudIcon className="h-10 w-10 text-slate-400 mb-3" />
            <p className="text-sm font-medium text-slate-700">
              {isDragActive ? 'Drop the CV here' : 'Drag & drop a CV or click to browse'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PDF, DOCX, ODT, RTF, TXT, MD — max 10 MB
            </p>
          </>
        )}
      </div>

      {/* Rejection / upload errors */}
      {(rejectionMsg || isError) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
        >
          <XCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{rejectionMsg ?? (uploadState as { status: 'error'; message: string }).message}</span>
        </div>
      )}
    </div>
  )
}
