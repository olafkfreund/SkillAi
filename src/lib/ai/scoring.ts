/**
 * triggerScoring — fire-and-forget AI scoring pipeline
 *
 * Called after a candidate is uploaded. Runs in the background
 * (not awaited by the createCandidate server action).
 *
 * Flow:
 *  1. Set score_status = 'processing'
 *  2. Fetch candidate + role data
 *  3. Call Claude scoring API
 *  4. Write results back to scores table
 *  5. On error: set score_status = 'failed' + error_message
 */

import { eq, and, sql } from 'drizzle-orm'
import { db, withTenant } from '@/db'
import { candidates, roles, scores, customerFrameworks, tenantSettings } from '@/db/schema'
import { scoreCandidateWithClaude } from './claude'
import { scoreCandidateWithGemini } from './gemini'
import { writeAuditLog } from '@/lib/audit'

export async function triggerScoring(
  candidateId: string,
  roleId: string,
  tenantId: string
): Promise<void> {
  // Mark as processing
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(scores)
      .set({ scoreStatus: 'processing', updatedAt: new Date() })
      .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
  })

  try {
    // Fetch candidate and role
    const [candidate] = await withTenant(tenantId, async (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1)
    )
    const [role] = await withTenant(tenantId, async (tx) =>
      tx.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    )

    if (!candidate || !role) {
      throw new Error('Candidate or role not found')
    }

    // Fetch customer framework if role has a framework level set
    let frameworkContext: string | undefined
    if (role.frameworkLevelId && role.customerId) {
      const [framework] = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_tenant_context(${tenantId}::uuid)`)
        return tx
          .select()
          .from(customerFrameworks)
          .where(eq(customerFrameworks.customerId, role.customerId!))
          .limit(1)
      })
      if (framework && framework.levels.length > 0) {
        const targetLevel = framework.levels.find((l) => l.id === role.frameworkLevelId)
        if (targetLevel) {
          const sortedLevels = [...framework.levels].sort((a, b) => a.order - b.order)
          const levelList = sortedLevels
            .map((l) => `  ${l.code}: ${l.title}${l.id === role.frameworkLevelId ? ' \u2190 TARGET' : ''}`)
            .join('\n')
          frameworkContext = `Framework: ${framework.name}

TARGET BAND: ${targetLevel.code} \u2014 ${targetLevel.title}
${targetLevel.description ? `Band Description: ${targetLevel.description}` : ''}

All bands (sorted by seniority):
${levelList}

When scoring experience_level, assess specifically whether the candidate's seniority, scope of responsibility, and technical depth align with ${targetLevel.code}. Reference the band explicitly in your reasoning. Penalise clear under-qualification heavily. Penalise heavy overqualification moderately (overqualified candidates are unlikely to accept or stay).`
        }
      }
    }

    // Resolve AI model preference (tenant setting → default Claude)
    const [modelSetting] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ value: tenantSettings.value })
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, 'default_ai_model')))
        .limit(1)
    )
    const useGemini = modelSetting?.value === 'gemini'

    const budgetContext = buildBudgetContext(
      { customerDayRate: role.customerDayRate, rateCurrency: role.rateCurrency },
      { candidateRate: candidate.candidateRate, rateCurrency: candidate.rateCurrency }
    )

    const scoringInput = {
      roleTitle: role.title,
      roleDescription: role.description,
      roleRequirements: role.requirements,
      cvText: candidate.cvText,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      frameworkContext,
      budgetContext,
      priorityKeywords: role.priorityKeywords,
    }

    const result = useGemini
      ? await scoreCandidateWithGemini({ ...scoringInput, tenantId })
      : await scoreCandidateWithClaude({ ...scoringInput, tenantId })

    // Write results
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(scores)
        .set({
          scoreStatus: 'complete',
          overallScore: result.overall_score,
          technicalScore: result.dimensions.technical_skills.score,
          experienceScore: result.dimensions.experience_level.score,
          culturalFitScore: result.dimensions.cultural_fit.score,
          communicationScore: result.dimensions.communication.score,
          technicalReasoning: result.dimensions.technical_skills.reasoning,
          experienceReasoning: result.dimensions.experience_level.reasoning,
          culturalFitReasoning: result.dimensions.cultural_fit.reasoning,
          communicationReasoning: result.dimensions.communication.reasoning,
          aiSummary: result.summary,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
    })

    writeAuditLog(tenantId, {
      action: 'score.completed',
      entityType: 'score',
      entityId: candidateId,
      metadata: {
        roleId,
        overallScore: result.overall_score,
        model: useGemini ? 'gemini' : 'claude',
      },
    }).catch(() => {})
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(scores)
        .set({ scoreStatus: 'failed', errorMessage: message, updatedAt: new Date() })
        .where(and(eq(scores.candidateId, candidateId), eq(scores.roleId, roleId)))
    })

    writeAuditLog(tenantId, {
      action: 'score.failed',
      entityType: 'score',
      entityId: candidateId,
      metadata: { roleId, error: message },
    }).catch(() => {})

    console.error(`Scoring failed for candidate ${candidateId}:`, message)
  }
}

/**
 * Build a soft budget signal for the AI prompt.
 *
 * Returns undefined when either side is missing, or when currencies mismatch
 * (to avoid confusing the model with cross-currency math).
 *
 * The budget signal is textual guidance only — it never changes the four
 * structured scoring dimensions (technical_skills, experience_level,
 * cultural_fit, communication). Rates are negotiable, so over-budget is
 * flagged in the summary but not penalised numerically.
 */
function buildBudgetContext(
  role: { customerDayRate: string | null; rateCurrency: string | null },
  candidate: { candidateRate: string | null; rateCurrency: string | null }
): string | undefined {
  if (!role.customerDayRate || !candidate.candidateRate) return undefined
  if (role.rateCurrency && candidate.rateCurrency && role.rateCurrency !== candidate.rateCurrency) return undefined
  const budget = Number(role.customerDayRate)
  const ask = Number(candidate.candidateRate)
  const delta = budget - ask
  const pctOver = ask > budget ? ((ask - budget) / budget) * 100 : 0
  const ccy = role.rateCurrency ?? candidate.rateCurrency ?? ''
  return `BUDGET SIGNAL (soft):
Role budget (what client will pay): ${ccy} ${budget.toFixed(0)}/day
Candidate asking rate:               ${ccy} ${ask.toFixed(0)}/day
Implied margin:                      ${ccy} ${delta.toFixed(0)}/day${pctOver > 0 ? ` (${pctOver.toFixed(0)}% over budget)` : ''}

GUIDANCE: Rates are commonly negotiable. Do NOT heavily penalise score for being over budget.
- If within budget or within ~10% over: no impact on scores.
- If 10-25% over: mention in the summary as "slightly above budget, may require negotiation."
- If >25% over: mention in the summary as "significantly above budget — likely needs negotiation or may be misaligned with seniority expected."
Never lower technical_skills, experience_level, cultural_fit, or communication scores on budget grounds alone.`
}
