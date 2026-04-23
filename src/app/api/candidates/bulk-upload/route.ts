import { NextRequest, after } from 'next/server'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { candidates, scores } from '@/db/schema'
import { triggerScoring } from '@/lib/ai/scoring'
import { auth } from '@/lib/auth'
import { validateCvFile, parseCvBuffer, persistCvFile } from '@/lib/cv/store'
import { ParseError } from '@/lib/parsers'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const userId = session.user.id

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

    // Validate file (size, type, magic bytes)
    const validated = await validateCvFile(file)
    if (!validated.ok) {
      return Response.json({ success: false, error: validated.error }, { status: 400 })
    }
    const { fileType, buffer } = validated

    // Parse CV text
    let cvText: string
    try {
      ;({ cvText } = await parseCvBuffer(buffer, fileType))
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

    // Persist CV file to disk
    const { filePath } = await persistCvFile(tenantId, buffer, fileType)

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
        filePath,
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

      // CV profile extraction — parallel with embedding
      try {
        const { triggerCvProfileExtraction } = await import('@/lib/ai/cv-profile')
        await triggerCvProfileExtraction(candidateId, tenantId)
      } catch (err) {
        console.error('[cv-profile] Failed to extract for candidate:', candidateId, err)
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
