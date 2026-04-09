/**
 * Pure helper functions for interview generation — no external dependencies
 * (testable without the Anthropic SDK)
 */

import type { CvProfile } from './interview-schemas'

export function inferExperienceLevel(cvText: string): CvProfile['experience_level'] {
  const text = cvText.toLowerCase()

  const yearsMatch = text.match(/(\d+)\+?\s+years?\s+(?:of\s+)?(?:experience|exp)/i)
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1], 10)
    if (years >= 10) return 'lead'
    if (years >= 6) return 'senior'
    if (years >= 3) return 'mid'
    return 'junior'
  }

  if (/\b(lead|principal|staff|head of|director|vp)\b/.test(text)) return 'lead'
  if (/\b(senior|sr\.?|experienced)\b/.test(text)) return 'senior'
  if (/\b(junior|jr\.?|graduate|intern|entry.level)\b/.test(text)) return 'junior'

  return 'mid'
}

export function inferLanguage(skills: string[]): string {
  const LANGUAGES = ['TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin']
  for (const lang of LANGUAGES) {
    if (skills.some((s) => s.toLowerCase() === lang.toLowerCase())) return lang
  }
  return 'TypeScript'
}
