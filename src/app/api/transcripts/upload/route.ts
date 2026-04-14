/**
 * POST /api/transcripts/upload
 *
 * Accepts a transcript file (VTT, SRT, TXT) or pasted text via FormData.
 * Parses to structured cues, stores in DB, fires background analysis.
 *
 * FormData fields:
 *   candidateId  string  required
 *   roleId       string  required
 *   platform     string  required  (teams|zoom|meet|other)
 *   packId       string  optional
 *   file         File    optional  (VTT, SRT, TXT)
 *   text         string  optional  (direct paste)
 *   interviewDate string optional  (ISO date string)
 *
 * One of file or text is required.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewTranscripts } from '@/db/schema'
import { parseTranscriptFile, type TranscriptFormat } from '@/lib/parsers/transcript'
import { triggerTranscriptAnalysis } from '@/lib/ai/transcript-analysis'
import type { TranscriptCue } from '@/lib/parsers/transcript'

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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const candidateId = formData.get('candidateId') as string | null
  const roleId = formData.get('roleId') as string | null
  const platform = (formData.get('platform') as string | null) ?? 'other'
  const packId = formData.get('packId') as string | null
  const pastedText = formData.get('text') as string | null
  const interviewDateRaw = formData.get('interviewDate') as string | null
  const file = formData.get('file') as File | null

  if (!candidateId || !roleId) {
    return NextResponse.json(
      { error: 'candidateId and roleId are required' },
      { status: 400 }
    )
  }

  if (!file && !pastedText) {
    return NextResponse.json(
      { error: 'Either a file or pasted text is required' },
      { status: 400 }
    )
  }

  let rawTranscriptText: string
  let parsedTranscript: TranscriptCue[]
  let sourceFormat: TranscriptFormat

  if (pastedText && !file) {
    // Direct paste path
    sourceFormat = 'paste'
    const result = await parseTranscriptFile(Buffer.from(pastedText, 'utf-8'), 'paste')
    rawTranscriptText = result.rawText
    parsedTranscript = result.cues
  } else if (file) {
    // File upload path
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 })
    }

    // Detect format from extension or MIME type
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    sourceFormat =
      EXT_TO_FORMAT[ext] ?? MIME_TO_FORMAT[file.type] ?? 'txt'

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseTranscriptFile(buffer, sourceFormat)
    rawTranscriptText = result.rawText
    parsedTranscript = result.cues
  } else {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 })
  }

  let interviewDate: Date | null = null
  if (interviewDateRaw) {
    const parsed = new Date(interviewDateRaw)
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid interviewDate format' }, { status: 400 })
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
        packId: packId && packId.length > 0 ? packId : null,
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

  // Fire-and-forget background analysis
  after(async () => {
    await triggerTranscriptAnalysis(transcriptId, tenantId)
  })

  return NextResponse.json({ transcriptId, status: 'pending' })
}
