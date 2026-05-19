// CV signal extraction + deterministic verification rules used before AI matcher fallback.

import type {
  CvSignals,
  ProfileCandidate,
  MatchVerdict,
} from '@/lib/ai/profile-matcher'

// ─── CV signal extraction ────────────────────────────────────────────────────

export type CandidateRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  githubUsername: string | null
  linkedinUrl: string | null
  city: string | null
  country: string | null
}

export type CvProfileLite = {
  technicalSkills: string[] | null
  companies: Array<{ name: string; role: string; keyAchievements: string[] }> | null
}

export function buildCvSignalsForMatcher(
  candidate: CandidateRow,
  cvProfile: CvProfileLite | null
): CvSignals {
  const fullName = `${candidate.firstName} ${candidate.lastName}`.trim()
  const location = [candidate.city, candidate.country].filter(Boolean).join(', ')

  const companies = cvProfile?.companies ?? []
  const currentCompany = companies[0]?.name?.trim() || undefined
  const pastCompanies = companies
    .slice(1)
    .map((c) => c?.name?.trim())
    .filter((n): n is string => !!n)

  const topSkills = (cvProfile?.technicalSkills ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
    .slice(0, 10)

  return {
    fullName,
    email: candidate.email ?? undefined,
    currentCompany,
    pastCompanies: pastCompanies.length ? pastCompanies : undefined,
    location: location || undefined,
    topSkills: topSkills.length ? topSkills : undefined,
  }
}

// ─── Deterministic verification ──────────────────────────────────────────────

/**
 * Cheap signal-based verification before falling back to AI.
 * Returns null if no deterministic rule fires; caller will then batch the
 * candidate into an AI verification call.
 */
export function deterministicVerify(
  candidate: ProfileCandidate,
  signals: CvSignals
): MatchVerdict | null {
  const blob = `${candidate.url} ${candidate.snippet}`.toLowerCase()
  const fullName = signals.fullName.trim().toLowerCase()
  const email = signals.email?.trim().toLowerCase()
  const location = signals.location?.trim().toLowerCase()
  const currentCompany = signals.currentCompany?.trim().toLowerCase()

  // 1. Email match — strongest possible signal
  if (email && email.length >= 5 && blob.includes(email)) {
    return {
      url: candidate.url,
      confidence: 100,
      category: 'high',
      reason: 'email match in profile',
    }
  }

  const nameInBlob = !!fullName && blob.includes(fullName)

  // 2. GitHub: name + location
  if (
    candidate.source === 'github' &&
    nameInBlob &&
    location &&
    location.length >= 2 &&
    blob.includes(location)
  ) {
    return {
      url: candidate.url,
      confidence: 92,
      category: 'high',
      reason: 'github name+location match',
    }
  }

  // 3. Generic: name + current company
  if (
    nameInBlob &&
    currentCompany &&
    currentCompany.length >= 2 &&
    blob.includes(currentCompany)
  ) {
    return {
      url: candidate.url,
      confidence: 85,
      category: 'high',
      reason: 'name+company match',
    }
  }

  return null
}
