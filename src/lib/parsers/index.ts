export * from './transcript'

/**
 * CV file parser dispatcher
 *
 * Accepts a Buffer and file type string, returns extracted plain text.
 * Throws ParseError for unsupported types or extraction failures.
 */

import type { fileTypeEnum } from '@/db/schema/candidates'

export type FileType = (typeof fileTypeEnum.enumValues)[number]

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export async function parseFile(buffer: Buffer, fileType: FileType): Promise<string> {
  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer)
    case 'docx':
      return parseDocx(buffer)
    case 'odt':
      return parseOdt(buffer)
    case 'rtf':
      return parseRtf(buffer)
    case 'txt':
    case 'md':
      return buffer.toString('utf-8')
    default:
      throw new ParseError(`Unsupported file type: ${fileType}`)
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  try {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    const trimmed = text?.trim()
    if (!trimmed) throw new ParseError('PDF produced empty text — file may be image-only')
    return trimmed
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(`PDF parsing failed: ${(err as Error).message}`)
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  try {
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value?.trim()
    if (!text) throw new ParseError('DOCX produced empty text')
    return text
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(`DOCX parsing failed: ${(err as Error).message}`)
  }
}

async function parseOdt(buffer: Buffer): Promise<string> {
  // ODT files are ZIP archives — extract content.xml and strip XML tags
  const JSZip = (await import('jszip')).default
  try {
    const zip = await JSZip.loadAsync(buffer)
    const contentFile = zip.file('content.xml')
    if (!contentFile) throw new ParseError('ODT missing content.xml')

    const xml = await contentFile.async('string')

    // Strip XML tags and decode common XML entities
    const text = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) throw new ParseError('ODT produced empty text')
    return text
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(`ODT parsing failed: ${(err as Error).message}`)
  }
}

async function parseRtf(buffer: Buffer): Promise<string> {
  const rtfParser = await import('rtf-parser')
  return new Promise((resolve, reject) => {
    const rtfString = buffer.toString('utf-8')
    rtfParser.string(rtfString, (err: Error | null, doc: { content?: RtfContent[] }) => {
      if (err) {
        reject(new ParseError(`RTF parsing failed: ${err.message}`))
        return
      }
      const text = extractRtfText(doc.content ?? []).trim()
      if (!text) {
        reject(new ParseError('RTF produced empty text'))
        return
      }
      resolve(text)
    })
  })
}

// RTF document tree types (rtf-parser internal structure)
type RtfContent = {
  value?: string
  content?: RtfContent[]
}

function extractRtfText(content: RtfContent[]): string {
  return content
    .map((node) => {
      const parts: string[] = []
      if (typeof node.value === 'string') parts.push(node.value)
      if (node.content?.length) parts.push(extractRtfText(node.content))
      return parts.join('')
    })
    .join(' ')
}
