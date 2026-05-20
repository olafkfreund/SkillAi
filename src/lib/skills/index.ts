/**
 * HR Skill loader — pre-req stub for issue #196.
 *
 * Loads vendored skill markdown from `src/content/skills/hr/{profile}.md`
 * and returns it as a plain `{ profile, content }` shape suitable for
 * injection into a Claude `system` array as a cached text block.
 *
 * The full implementation in #196 will:
 *   - YAML-front-matter parse with `gray-matter`
 *   - Zod-validate the front-matter shape
 *   - Strip front-matter from the body before returning
 *   - Cache the read on the module scope
 *
 * For now (this stub) the helper does the smallest amount of work needed
 * to satisfy the call-site contract from #197: reading the file synchronously
 * via `fs.readFileSync`, stripping the YAML block, and returning the body.
 *
 * Wiring contract (do not change without updating #197 call sites):
 *   loadHrSkill(profile?: string): { profile: string; content: string } | null
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type HrSkillProfile = 'recruiter-eu-uk'

export type HrSkill = {
  profile: HrSkillProfile
  content: string
}

const SKILLS_DIR = join(process.cwd(), 'src', 'content', 'skills', 'hr')

/**
 * Load an HR skill profile by name. Returns `null` if the file cannot be
 * read for any reason — callers (`scoreCandidateWithClaude`,
 * `generateQuestions`, `analyzeTranscriptWithClaude`) must treat a missing
 * skill as equivalent to the toggle being off (no system block injected).
 */
export function loadHrSkill(profile: HrSkillProfile = 'recruiter-eu-uk'): HrSkill | null {
  try {
    const raw = readFileSync(join(SKILLS_DIR, `${profile}.md`), 'utf-8')
    return {
      profile,
      content: stripFrontMatter(raw).trim(),
    }
  } catch {
    return null
  }
}

/**
 * Strip a leading YAML front-matter block (`---\n…\n---\n`) if present.
 * The full #196 implementation will use `gray-matter` and surface the
 * parsed metadata; the stub only needs the body.
 */
function stripFrontMatter(raw: string): string {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return raw
  const closing = raw.indexOf('\n---', 4)
  if (closing === -1) return raw
  // Skip past the closing `---` and the following newline (LF or CRLF).
  let cursor = closing + 4
  if (raw[cursor] === '\r') cursor += 1
  if (raw[cursor] === '\n') cursor += 1
  return raw.slice(cursor)
}
