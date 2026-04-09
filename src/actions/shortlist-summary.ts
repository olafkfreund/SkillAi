'use server'

import { headers } from 'next/headers'
import { withTenant } from '@/db'
import { scores, candidates, roles } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateShortlistSummary } from '@/lib/ai/shortlist-summary'

export async function getShortlistSummary(
  roleId: string
): Promise<{ summary: string } | { error: string }> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return { error: 'Unauthorized' }

  try {
    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    )
    if (!role) return { error: 'Role not found' }

    const topCandidates = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          overallScore: scores.overallScore,
          technicalScore: scores.technicalScore,
          experienceScore: scores.experienceScore,
          culturalFitScore: scores.culturalFitScore,
          communicationScore: scores.communicationScore,
          aiSummary: scores.aiSummary,
        })
        .from(scores)
        .innerJoin(candidates, eq(scores.candidateId, candidates.id))
        .where(eq(scores.roleId, roleId))
        .orderBy(desc(scores.overallScore))
        .limit(5)
    )

    if (topCandidates.length < 2) {
      return { error: 'Need at least 2 scored candidates to generate a summary.' }
    }

    const summary = await generateShortlistSummary(
      role.title,
      role.requirements ?? '',
      topCandidates.map((c) => ({
        name: `${c.firstName} ${c.lastName}`,
        overallScore: c.overallScore ?? 0,
        technicalScore: c.technicalScore,
        experienceScore: c.experienceScore,
        culturalFitScore: c.culturalFitScore,
        communicationScore: c.communicationScore,
        aiSummary: c.aiSummary,
      })),
      tenantId
    )

    return { summary }
  } catch (err) {
    console.error('[shortlist-summary]', err)
    return { error: 'Failed to generate summary. Check your Claude API key.' }
  }
}
