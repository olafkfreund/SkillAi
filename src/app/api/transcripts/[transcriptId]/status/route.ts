/**
 * GET /api/transcripts/[transcriptId]/status
 *
 * Lightweight poll endpoint — returns only analysisStatus + errorMessage.
 * Used by the UI to poll every 3s until status is 'complete' or 'failed'.
 */

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { withTenant } from '@/db'
import { interviewTranscripts } from '@/db/schema'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transcriptId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const { transcriptId } = await params

  const [row] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        analysisStatus: interviewTranscripts.analysisStatus,
        errorMessage: interviewTranscripts.errorMessage,
      })
      .from(interviewTranscripts)
      .where(eq(interviewTranscripts.id, transcriptId))
      .limit(1)
  )

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(row)
}
