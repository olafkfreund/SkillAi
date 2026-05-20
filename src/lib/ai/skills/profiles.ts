/**
 * Shared HR skill profile constants — lives outside the "use server" actions
 * file because Next.js forbids non-async exports from server-action modules.
 *
 * Consumed by:
 *   - src/actions/settings.ts (Zod enum + runtime resolution)
 *   - src/components/settings/ai-behaviour-panel.tsx (UI dropdown options)
 *   - src/lib/ai/skills/index.ts (helper, once #196 lands)
 */
export const HR_SKILL_PROFILES = [
  'recruiter-eu-uk',
  'talent-acquisition',
  'people-analytics',
] as const

export type HrSkillProfile = (typeof HR_SKILL_PROFILES)[number]
