/**
 * HR skill tenant toggle reader — pre-req stub for issue #198.
 *
 * Reads two settings rows from the existing K/V `tenant_settings` table:
 *
 *   key = 'hr_skill_enabled'  → 'true' | 'false'  (defaults to false)
 *   key = 'hr_skill_profile'  → 'recruiter-eu-uk' (defaults to that)
 *
 * The actual #198 PR will land:
 *   - admin UI on /settings to flip the toggle + pick a profile
 *   - server action wrapping audit + the K/V write
 *   - help article describing the rollout policy
 *
 * For now this stub gives #197 the smallest possible reader so the
 * three AI call sites can gate the skill block.
 *
 * IMPORTANT: returns `{ enabled: false, profile: 'recruiter-eu-uk' }`
 * on ANY error (RLS denied, table missing in test env, decrypt failure,
 * etc.) so the toggle is fail-closed. Existing tenants get the same
 * byte-identical Claude prompts they had before.
 */

import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import type { HrSkillProfile } from './index'

export type HrSkillSettings = {
  enabled: boolean
  profile: HrSkillProfile
}

const DEFAULTS: HrSkillSettings = {
  enabled: false,
  profile: 'recruiter-eu-uk',
}

const VALID_PROFILES: readonly HrSkillProfile[] = ['recruiter-eu-uk'] as const

/**
 * Read the HR skill toggle for a tenant.
 *
 * Resolution: tenant_settings row → DEFAULTS. Never throws.
 *
 * The toggle values are stored as plain (NOT encrypted) strings —
 * unlike API keys, the boolean has no secrecy value. The #198 PR will
 * confirm this and document it next to the encrypted API-key rows.
 */
export async function getHrSkillSettings(tenantId: string): Promise<HrSkillSettings> {
  if (!tenantId) return DEFAULTS

  try {
    // RLS scopes by tenant; an extra equality on tenant_id would be
    // belt-and-braces. We only need the two relevant keys, but app-side
    // filtering keeps the WHERE clause simple — the K/V table is small
    // (a handful of rows per tenant) and indexed by (tenant_id, key).
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ key: tenantSettings.key, value: tenantSettings.value })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
    )

    let enabled = DEFAULTS.enabled
    let profile: HrSkillProfile = DEFAULTS.profile

    for (const row of rows) {
      if (row.key === 'hr_skill_enabled') {
        enabled = row.value === 'true'
      } else if (row.key === 'hr_skill_profile') {
        const candidate = row.value as HrSkillProfile
        if (VALID_PROFILES.includes(candidate)) {
          profile = candidate
        }
      }
    }

    return { enabled, profile }
  } catch {
    return DEFAULTS
  }
}
