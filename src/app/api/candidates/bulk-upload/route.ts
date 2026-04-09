import { NextRequest, after } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { parseFile, ParseError } from '@/lib/parsers'
import { triggerScoring } from '@/lib/ai/scoring'
import type { FileType } from '@/lib/parsers'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const ACCEPTED_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
}

const EXT_TO_TYPE: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.odt': 'odt',
  '.rtf': 'rtf',
  '.txt': 'txt',
  '.md': 'md',
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  const userId = request.headers.get('x-user-id')

  if (!tenantId || !userId) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const roleId = formData.get('roleId') as string | null
    const agencyId = formData.get('agencyId') as string | null

    if (!file || !roleId) {
      return Response.json(
        { success: false, error: 'File and roleId are required' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return Response.json({ success: false, error: 'File is empty' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { success: false, error: 'File exceeds 10 MB limit' },
        { status: 400 }
      )
    }

    // Determine file type from MIME or extension
    const fileType: FileType | undefined =
      ACCEPTED_TYPES[file.type] ?? EXT_TO_TYPE[extname(file.name).toLowerCase()]

    if (!fileType) {
      return Response.json(
        {
          success: false,
          error: `Unsupported file type: ${file.type || extname(file.name)}`,
        },
        { status: 400 }
      )
    }

    // Parse CV text from file buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    let cvText: string
    try {
      cvText = await parseFile(buffer, fileType)
      cvText = cvText.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    } catch (err) {
      if (err instanceof ParseError) {
        return Response.json({ success: false, error: err.message }, { status: 422 })
      }
      return Response.json(
        { success: false, error: 'Failed to extract text from CV' },
        { status: 422 }
      )
    }

    // Derive a candidate name from the filename (strip extension, replace separators)
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
    const nameParts = baseName.split(' ')
    const firstName = nameParts[0] ?? 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || 'Candidate'

    // Store file on disk
    const uploadBase = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')
    const uploadDir = join(uploadBase, tenantId)
    await mkdir(uploadDir, { recursive: true })

    const fileId = randomUUID()
    const fileName = `${fileId}.${fileType}`
    const filePath = join(uploadDir, fileName)
    await writeFile(filePath, buffer)

    // Insert candidate + pending score row within tenant RLS context
    const candidateId = randomUUID()

    await withTenant(tenantId, async (tx) => {
      await tx.insert(candidates).values({
        id: candidateId,
        tenantId,
        agencyId: agencyId ?? null,
        firstName,
        lastName,
        email: null,
        phone: null,
        cvText,
        filePath: `/uploads/${tenantId}/${fileName}`,
        fileType,
      })

      await tx.insert(scores).values({
        tenantId,
        candidateId,
        roleId,
        scoreStatus: 'pending',
      })
    })

    // Fire-and-forget AI scoring (non-blocking)
    triggerScoring(candidateId, roleId, tenantId).catch(console.error)

    // Fire-and-forget embedding generation (non-blocking, after response is sent)
    after(async () => {
      try {
        const { generateEmbedding } = await import('@/lib/ai/embeddings')
        const embedding = await generateEmbedding(cvText, tenantId)
        if (embedding) {
          await withTenant(tenantId, async (tx) => {
            await tx.update(candidates).set({ embedding: JSON.stringify(embedding) }).where(eq(candidates.id, candidateId))
          })
        }
      } catch (err) {
        console.error('[embedding] Failed to generate embedding for candidate:', candidateId, err)
      }
    })

    return Response.json({
      success: true,
      candidateId,
      name: `${firstName} ${lastName}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
