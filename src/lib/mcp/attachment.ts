/**
 * Attachment helper — converts files and buffers into the structured
 * attachment shape used by export tools in the MCP adapter.
 *
 * Format:
 *   { filename, mimeType, dataBase64, sizeBytes }
 *
 * Tools that produce binaries (PDFs, CV files) return one or more of these
 * objects in their structured content so MCP clients can save / preview them.
 */

import { readFile } from 'node:fs/promises'

export type Attachment = {
  filename: string
  mimeType: string
  dataBase64: string
  sizeBytes: number
}

/**
 * fileToAttachment — read an absolute file path and wrap it as an Attachment.
 * Throws if the file is missing or unreadable.
 */
export async function fileToAttachment(
  absolutePath: string,
  filename: string,
  mimeType: string
): Promise<Attachment> {
  const buf = await readFile(absolutePath)
  return bufferToAttachment(buf, filename, mimeType)
}

/**
 * bufferToAttachment — wrap an in-memory Buffer/Uint8Array as an Attachment.
 */
export function bufferToAttachment(
  buffer: Buffer | Uint8Array,
  filename: string,
  mimeType: string
): Attachment {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  return {
    filename,
    mimeType,
    dataBase64: b.toString('base64'),
    sizeBytes: b.byteLength,
  }
}
