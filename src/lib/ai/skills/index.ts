/**
 * HR skill loader — reads vendored skill markdown files from this directory
 * and returns them as plain strings ready to be plumbed into the Claude
 * system prompt.
 *
 * Three profiles:
 *   - talent-acquisition  → talent-acquisition.md
 *   - people-analytics    → people-analytics.md
 *   - recruiter-eu-uk     → talent-acquisition.md + '\n\n---\n\n' + eu-uk-supplement.md
 *
 * `recruiter-eu-uk` is SkillAi's default; it combines the upstream talent-
 * acquisition skill with the SkillAi-authored EU/UK right-to-work supplement.
 *
 * Files are read from disk on first call per profile and cached at module
 * scope, so repeat calls are cheap (string lookup, no fs hit).
 */
import fs from 'node:fs'
import path from 'node:path'

export type SkillProfile = 'talent-acquisition' | 'people-analytics' | 'recruiter-eu-uk'

export type LoadedHrSkill = { name: string; content: string }

// Module-level cache. Cleared automatically when the process restarts; never
// mutated after first write.
const cache = new Map<SkillProfile, LoadedHrSkill>()

// `import.meta.dirname` is the canonical accessor under Node ≥ 20 ESM and
// modern bundlers; `__dirname` is the CJS fallback. Vitest and Next.js both
// resolve one or the other depending on transform.
function dirOfThisFile(): string {
  const importMetaDir = typeof import.meta !== 'undefined' ? import.meta.dirname : undefined
  return importMetaDir ?? __dirname
}

function readSkillFile(filename: string): string {
  return fs.readFileSync(path.join(dirOfThisFile(), filename), 'utf-8')
}

export function loadHrSkill(profile: SkillProfile): LoadedHrSkill {
  const cached = cache.get(profile)
  if (cached) return cached

  let loaded: LoadedHrSkill
  switch (profile) {
    case 'talent-acquisition':
      loaded = { name: 'talent-acquisition', content: readSkillFile('talent-acquisition.md') }
      break
    case 'people-analytics':
      loaded = { name: 'people-analytics', content: readSkillFile('people-analytics.md') }
      break
    case 'recruiter-eu-uk': {
      const ta = readSkillFile('talent-acquisition.md')
      const supplement = readSkillFile('eu-uk-supplement.md')
      loaded = {
        name: 'recruiter-eu-uk',
        content: `${ta}\n\n---\n\n${supplement}`,
      }
      break
    }
    default: {
      // Exhaustiveness check — TS will error if a new SkillProfile member is
      // added without updating this switch.
      const _exhaustive: never = profile
      throw new Error(`Unknown HR skill profile: ${String(_exhaustive)}`)
    }
  }

  cache.set(profile, loaded)
  return loaded
}
