'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { uploadTranscript, type UploadTranscriptState } from '@/actions/transcripts'
import { Loader2Icon, UploadIcon, ClipboardIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react'

type Platform = 'teams' | 'zoom' | 'meet' | 'other'

type Pack = {
  id: string
  title: string
}

type Props = {
  candidateId: string
  roleId: string
  packs?: Pack[]
  userRole: 'admin' | 'recruiter' | 'viewer'
  onSuccess?: () => void
}

type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'failed'

const PLATFORM_LABELS: Record<Platform, string> = {
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  meet: 'Google Meet',
  other: 'Other',
}

export function TranscriptUploadForm({ candidateId, roleId, packs = [], userRole, onSuccess }: Props) {
  const [state, action, pending] = useActionState<UploadTranscriptState | null, FormData>(
    uploadTranscript,
    null
  )

  const [tab, setTab] = useState<'file' | 'paste'>('file')
  const [platform, setPlatform] = useState<Platform>('zoom')
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start polling when upload succeeds
  useEffect(() => {
    if (!state?.success) return
    const transcriptId = state.transcriptId
    setAnalysisStatus('pending')

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/transcripts/${transcriptId}/status`)
        if (!res.ok) return
        const data = await res.json() as { analysisStatus: AnalysisStatus; errorMessage?: string }
        setAnalysisStatus(data.analysisStatus)
        if (data.analysisStatus === 'complete' || data.analysisStatus === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          setErrorMessage(data.errorMessage ?? null)
          if (data.analysisStatus === 'complete') onSuccess?.()
        }
      } catch {
        // ignore transient errors
      }
    }, 3000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [state, onSuccess])

  // Viewers cannot upload
  if (userRole === 'viewer') return null

  // Analysis in progress
  if (state?.success && analysisStatus && analysisStatus !== 'complete' && analysisStatus !== 'failed') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-950 border border-amber-800 px-5 py-4">
        <Loader2Icon className="h-5 w-5 text-amber-400 animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-400">Analysing transcript…</p>
          <p className="text-xs text-amber-500 mt-0.5">
            Claude is scoring the interview. This takes 15–45 seconds.
          </p>
        </div>
      </div>
    )
  }

  // Analysis failed
  if (state?.success && analysisStatus === 'failed') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-950 border border-red-800 px-5 py-4">
        <XCircleIcon className="h-5 w-5 text-red-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-400">Analysis failed</p>
          {errorMessage && (
            <p className="text-xs text-red-500 mt-0.5">{errorMessage}</p>
          )}
        </div>
      </div>
    )
  }

  // Analysis complete
  if (state?.success && analysisStatus === 'complete') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-950 border border-emerald-800 px-5 py-4">
        <CheckCircleIcon className="h-5 w-5 text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-medium text-emerald-400">Transcript analysed — scroll down to view results</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-100">Upload interview transcript</h3>

      {/* Upload error */}
      {state && !state.success && (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-4">
        {/* Hidden fields */}
        <input type="hidden" name="candidateId" value={candidateId} />
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="platform" value={platform} />

        {/* Platform selector */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Platform</label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlatform(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  platform === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional pack selector */}
        {packs.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5" htmlFor="packId">
              Link to interview pack <span className="text-zinc-500">(optional)</span>
            </label>
            <select
              id="packId"
              name="packId"
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No pack selected</option>
              {packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab toggle */}
        <div className="flex rounded-lg border border-zinc-700 p-0.5 bg-zinc-800 w-fit">
          <button
            type="button"
            onClick={() => setTab('file')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'file'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UploadIcon className="h-3 w-3" />
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setTab('paste')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'paste'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ClipboardIcon className="h-3 w-3" />
            Paste text
          </button>
        </div>

        {/* File upload */}
        {tab === 'file' && (
          <div>
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
                         border-zinc-600 bg-zinc-800 px-6 py-8 cursor-pointer
                         hover:border-zinc-500 hover:bg-zinc-750 transition-colors"
            >
              <UploadIcon className="h-6 w-6 text-zinc-500" />
              {fileName ? (
                <span className="text-sm text-zinc-300">{fileName}</span>
              ) : (
                <>
                  <span className="text-sm text-zinc-400">Click to select transcript file</span>
                  <span className="text-xs text-zinc-500">VTT, SRT, or TXT — up to 5 MB</span>
                </>
              )}
              <input
                type="file"
                name="file"
                accept=".vtt,.srt,.txt,text/vtt,text/plain,application/x-subrip"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </div>
        )}

        {/* Paste text */}
        {tab === 'paste' && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5" htmlFor="text">
              Transcript text
            </label>
            <textarea
              id="text"
              name="text"
              rows={10}
              placeholder={"Interviewer: Tell me about your experience with TypeScript.\n\nAlice: I've been using TypeScript for three years…"}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                         placeholder:text-zinc-600 font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Format: <span className="font-mono">Speaker Name: text</span> — one turn per paragraph
            </p>
          </div>
        )}

        {/* Optional interview date */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5" htmlFor="interviewDate">
            Interview date <span className="text-zinc-500">(optional)</span>
          </label>
          <input
            id="interviewDate"
            name="interviewDate"
            type="date"
            className="rounded-md border border-zinc-600 bg-zinc-800 text-zinc-100 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2
                     hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {pending ? 'Uploading…' : 'Upload transcript'}
        </button>
      </form>
    </div>
  )
}
