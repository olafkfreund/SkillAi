'use server'

import { getActionContext } from '@/lib/auth/action-context'
import { requireRole } from '@/lib/auth/require-role'
import { after } from 'next/server'
import { withTenant } from '@/db'
import { interviewTranscripts } from '@/db/schema'
import { parseTranscriptFile, type TranscriptFormat, type TranscriptCue } from '@/lib/parsers/transcript'
import { triggerTranscriptAnalysis } from '@/lib/ai/transcript-analysis'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const EXT_TO_FORMAT: Record<string, TranscriptFormat> = {
  '.vtt': 'vtt',
  '.srt': 'srt',
  '.txt': 'txt',
}

const MIME_TO_FORMAT: Record<string, TranscriptFormat> = {
  'text/vtt': 'vtt',
  'text/srt': 'srt',
  'application/x-subrip': 'srt',
  'text/plain': 'txt',
}

export type UploadTranscriptState =
  | { success: true; transcriptId: string }
  | { success: false; error: string }

export async function uploadTranscript(
  _prev: UploadTranscriptState | null,
  formData: FormData
): Promise<UploadTranscriptState> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorised' }

  try {
    requireRole(ctx.userRole, 'recruiter')
  } catch {
    return { success: false, error: 'Insufficient permissions' }
  }

  const { tenantId } = ctx

  const candidateId = formData.get('candidateId') as string | null
  const roleId = formData.get('roleId') as string | null
  const platform = (formData.get('platform') as string | null) ?? 'other'
  const packId = formData.get('packId') as string | null
  const pastedText = formData.get('text') as string | null
  const interviewDateRaw = formData.get('interviewDate') as string | null
  const file = formData.get('file') as File | null

  if (!candidateId || !roleId) {
    return { success: false, error: 'candidateId and roleId are required' }
  }

  if (!file && !pastedText) {
    return { success: false, error: 'Upload a file or paste transcript text' }
  }

  let rawTranscriptText: string
  let parsedTranscript: TranscriptCue[]
  let sourceFormat: TranscriptFormat

  try {
    if (pastedText && (!file || file.size === 0)) {
      sourceFormat = 'paste'
      const result = await parseTranscriptFile(Buffer.from(pastedText, 'utf-8'), 'paste')
      rawTranscriptText = result.rawText
      parsedTranscript = result.cues
    } else if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: 'File exceeds 5 MB limit' }
      }
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
      sourceFormat = EXT_TO_FORMAT[ext] ?? MIME_TO_FORMAT[file.type] ?? 'txt'
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await parseTranscriptFile(buffer, sourceFormat)
      rawTranscriptText = result.rawText
      parsedTranscript = result.cues
    } else {
      return { success: false, error: 'No transcript content provided' }
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse transcript: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }

  let interviewDate: Date | null = null
  if (interviewDateRaw) {
    const parsed = new Date(interviewDateRaw)
    if (isNaN(parsed.getTime())) {
      return { success: false, error: 'Invalid interviewDate format' }
    }
    interviewDate = parsed
  }

  const [transcript] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(interviewTranscripts)
      .values({
        tenantId,
        candidateId,
        roleId,
        packId: packId ?? undefined,
        rawTranscriptText,
        parsedTranscript,
        sourcePlatform: platform as 'teams' | 'zoom' | 'meet' | 'other',
        sourceFormat,
        interviewDate: interviewDate ?? undefined,
        analysisStatus: 'pending',
      })
      .returning({ id: interviewTranscripts.id })
  )

  const transcriptId = transcript.id

  after(async () => {
    await triggerTranscriptAnalysis(transcriptId, tenantId)
  })

  return { success: true, transcriptId }
}
