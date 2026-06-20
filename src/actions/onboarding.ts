'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ne, count } from 'drizzle-orm'
import { withTenant } from '@/db'
import { agencies, roles, candidates, scores, tenantSettings } from '@/db/schema'
import { getActionContext } from '@/lib/auth/action-context'

// Plain-text tenant_settings flag (not a secret). Once set, the first-run
// onboarding checklist never shows again for the tenant.
const ONBOARDING_DISMISSED_KEY = 'onboarding_dismissed'

export type OnboardingSteps = {
  agency: boolean
  role: boolean
  candidate: boolean
  score: boolean
}

export type OnboardingState = {
  visible: boolean
  steps: OnboardingSteps
}

const EMPTY: OnboardingState = {
  visible: false,
  steps: { agency: false, role: false, candidate: false, score: false },
}

/**
 * Computes the first-run onboarding state for the current tenant: whether the
 * checklist should show, and which of the four steps are already done.
 *
 * The checklist is shown until the tenant either dismisses it or completes all
 * four steps. A brand-new tenant (everything at zero) sees it; an established
 * tenant that has already added an agency, created a role, uploaded a CV and
 * scored a candidate never does. The per-tenant auto-provisioned "Internal"
 * system agency is excluded from the agency step (is_system), so it doesn't
 * tick step 1 for free.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  const ctx = await getActionContext()
  if (!ctx) return EMPTY
  const { tenantId } = ctx

  return withTenant(tenantId, async (tx) => {
    const [
      [{ value: dismissedCount }],
      [{ value: agencyCount }],
      [{ value: roleCount }],
      [{ value: candidateCount }],
      [{ value: scoreCount }],
    ] = await Promise.all([
      tx
        .select({ value: count() })
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, ONBOARDING_DISMISSED_KEY))),
      tx
        .select({ value: count() })
        .from(agencies)
        .where(and(eq(agencies.isActive, true), ne(agencies.isSystem, true))),
      tx.select({ value: count() }).from(roles),
      tx.select({ value: count() }).from(candidates).where(eq(candidates.isActive, true)),
      tx.select({ value: count() }).from(scores).where(eq(scores.scoreStatus, 'complete')),
    ])

    const steps: OnboardingSteps = {
      agency: agencyCount > 0,
      role: roleCount > 0,
      candidate: candidateCount > 0,
      score: scoreCount > 0,
    }
    const allComplete = steps.agency && steps.role && steps.candidate && steps.score
    const dismissed = dismissedCount > 0

    return { visible: !dismissed && !allComplete, steps }
  })
}

/**
 * Persists the "dismissed" flag so the onboarding checklist never shows again
 * for this tenant. Idempotent.
 */
export async function dismissOnboarding(): Promise<{ success: boolean }> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false }
  const { tenantId, userId } = ctx

  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key: ONBOARDING_DISMISSED_KEY, value: 'true', updatedBy: userId })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value: 'true', updatedBy: userId, updatedAt: new Date() },
      })
  })

  revalidatePath('/dashboard')
  return { success: true }
}
