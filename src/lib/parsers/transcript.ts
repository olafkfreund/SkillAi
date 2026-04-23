/**
 * Interview transcript parser
 *
 * Accepts a Buffer and source format, returns structured cues:
 * { rawText, cues: TranscriptCue[] }
 *
 * Supported formats:
 *   vtt   — WebVTT with optional <v Speaker> attribution
 *   srt   — SubRip with optional "Speaker: text" prefix
 *   txt   — Plain text with optional "Speaker: text" lines
 *   paste — Same as txt (direct paste from meeting notes)
 */

export type TranscriptFormat = 'vtt' | 'srt' | 'txt' | 'paste' | 'docx' | 'pdf'

export type TranscriptCue = {
  speaker: string
  timestamp: number  // milliseconds from start
  text: string
}

export type ParsedTranscript = {
  rawText: string
  cues: TranscriptCue[]
}

export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriptParseError'
  }
}

export async function parseTranscriptFile(
  buffer: Buffer,
  format: TranscriptFormat
): Promise<ParsedTranscript> {
  switch (format) {
    case 'vtt':
      return parseVtt(buffer)
    case 'srt':
      return parseSrt(buffer)
    case 'docx':
      return parseDocxTranscript(buffer)
    case 'pdf':
      return parsePdfTranscript(buffer)
    case 'txt':
    case 'paste':
      return parsePlainText(buffer)
    default:
      throw new TranscriptParseError(`Unsupported transcript format: ${format}`)
  }
}

// ── VTT parser ────────────────────────────────────────────────────────────────

/**
 * Strip cue identifier lines from VTT content.
 * Platforms like Microsoft Teams emit UUID-style cue IDs
 * (e.g. "176e0180-66d1-4a50-a48f-b3a385d0f37b/7-0") before each timestamp.
 * The `subtitle` library does not handle these, so we remove any non-blank
 * line that precedes a timestamp line and does not itself contain "-->".
 */
function stripCueIdentifiers(content: string): string {
  const lines = content.split('\n')
  const cleaned: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = lines[i + 1] || ''
    if (line.trim() && !line.includes('-->') && nextLine.includes('-->')) {
      continue
    }
    cleaned.push(line)
  }
  return cleaned.join('\n')
}

async function parseVtt(buffer: Buffer): Promise<ParsedTranscript> {
  const { parseSync } = await import('subtitle')
  const content = stripCueIdentifiers(buffer.toString('utf-8'))

  let nodes: ReturnType<typeof parseSync>
  try {
    nodes = parseSync(content)
  } catch (err) {
    throw new TranscriptParseError(`VTT parsing failed: ${(err as Error).message}`)
  }

  const cues: TranscriptCue[] = []

  for (const node of nodes) {
    if (node.type !== 'cue') continue

    const { start, text } = node.data
    // Extract <v Speaker Name>text</v> or <v Speaker Name>text
    const voiceMatch = text.match(/^<v ([^>]+)>([\s\S]*)/)
    if (voiceMatch) {
      cues.push({
        speaker: voiceMatch[1].trim(),
        timestamp: start,
        // Remove any remaining </v> tags
        text: voiceMatch[2].replace(/<\/v>/g, '').trim(),
      })
    } else {
      // No speaker tag — use Unknown
      cues.push({
        speaker: 'Unknown',
        timestamp: start,
        text: text.trim(),
      })
    }
  }

  const rawText = buildRawText(cues)
  return { rawText, cues }
}

// ── SRT parser ────────────────────────────────────────────────────────────────

async function parseSrt(buffer: Buffer): Promise<ParsedTranscript> {
  const { parseSync } = await import('subtitle')
  // SRT uses comma as decimal separator; subtitle package handles this
  const content = buffer.toString('utf-8')

  let nodes: ReturnType<typeof parseSync>
  try {
    nodes = parseSync(content)
  } catch (err) {
    throw new TranscriptParseError(`SRT parsing failed: ${(err as Error).message}`)
  }

  const cues: TranscriptCue[] = []

  for (const node of nodes) {
    if (node.type !== 'cue') continue

    const { start, text } = node.data
    // SRT speaker pattern: "Speaker Name: dialogue text"
    const speakerMatch = text.match(/^([A-Za-z][^:]{0,50}):\s+([\s\S]+)/)
    if (speakerMatch) {
      cues.push({
        speaker: speakerMatch[1].trim(),
        timestamp: start,
        text: speakerMatch[2].trim(),
      })
    } else {
      cues.push({
        speaker: 'Unknown',
        timestamp: start,
        text: text.trim(),
      })
    }
  }

  const rawText = buildRawText(cues)
  return { rawText, cues }
}

// ── Plain text / paste parser ─────────────────────────────────────────────────

async function parsePlainText(buffer: Buffer): Promise<ParsedTranscript> {
  const rawText = buffer.toString('utf-8')
  const lines = rawText.split('\n')

  const cues: TranscriptCue[] = []
  let currentSpeaker = 'Unknown'
  let currentLines: string[] = []

  const flushCurrent = () => {
    const text = currentLines.join(' ').trim()
    if (text) {
      cues.push({ speaker: currentSpeaker, timestamp: 0, text })
    }
    currentLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match "Speaker Name: dialogue" — colon after 1-50 non-colon chars starting with a letter
    const speakerMatch = trimmed.match(/^([A-Za-z][^:]{0,50}):\s+([\s\S]+)/)
    if (speakerMatch) {
      flushCurrent()
      currentSpeaker = speakerMatch[1].trim()
      currentLines = [speakerMatch[2].trim()]
    } else {
      currentLines.push(trimmed)
    }
  }
  flushCurrent()

  // If no speaker turns were detected, fall back to single cue
  if (cues.length === 0 || (cues.length === 1 && cues[0].speaker === 'Unknown')) {
    return {
      rawText,
      cues: [{ speaker: 'Unknown', timestamp: 0, text: rawText.trim() }],
    }
  }

  return { rawText, cues }
}

// ── DOCX transcript parser ───────────────────────────────────────────────────

async function parseDocxTranscript(buffer: Buffer): Promise<ParsedTranscript> {
  const mammoth = await import('mammoth')
  let text: string
  try {
    const result = await mammoth.extractRawText({ buffer })
    text = result.value
  } catch (err) {
    throw new TranscriptParseError(`DOCX extraction failed: ${(err as Error).message}`)
  }
  return parsePlainText(Buffer.from(text, 'utf-8'))
}

// ── PDF transcript parser ────────────────────────────────────────────────────

async function parsePdfTranscript(buffer: Buffer): Promise<ParsedTranscript> {
  const { extractText } = await import('unpdf')
  let text: string
  try {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true })
    text = result.text?.trim() ?? ''
    if (!text) throw new TranscriptParseError('PDF produced empty text — file may be image-only')
  } catch (err) {
    if (err instanceof TranscriptParseError) throw err
    throw new TranscriptParseError(`PDF extraction failed: ${(err as Error).message}`)
  }
  return parsePlainText(Buffer.from(text, 'utf-8'))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRawText(cues: TranscriptCue[]): string {
  return cues.map((c) => `[${c.speaker}]: ${c.text}`).join('\n')
}

/**
 * Remove characters Postgres text columns cannot store.
 * Null bytes (\u0000) and other C0 control chars leak through some DOCX/VTT
 * files (binary residue, unexpected encodings). Strip them defensively.
 */
export function sanitizeText(text: string): string {
  // Remove NULL bytes and other non-printable control chars except \t, \n, \r
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

export function sanitizeCues(cues: TranscriptCue[]): TranscriptCue[] {
  return cues.map((c) => ({
    ...c,
    speaker: sanitizeText(c.speaker),
    text: sanitizeText(c.text),
  }))
}
