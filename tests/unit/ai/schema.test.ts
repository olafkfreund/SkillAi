import { describe, it, expect } from 'vitest'
import { CandidateScoreSchema } from '@/lib/ai/schema'

const VALID_SCORE = {
  overall_score: 82,
  dimensions: {
    technical_skills: { score: 85, reasoning: 'Strong TypeScript and Node.js background.' },
    experience_level: { score: 80, reasoning: '7 years relevant experience.' },
    cultural_fit: { score: 78, reasoning: 'Collaborative history evident from CV.' },
    communication: { score: 85, reasoning: 'Clear and well-structured CV.' },
  },
  summary: 'Strong senior candidate with solid TypeScript background and relevant domain experience.',
}

describe('CandidateScoreSchema', () => {
  it('parses a valid score response', () => {
    const result = CandidateScoreSchema.safeParse(VALID_SCORE)
    expect(result.success).toBe(true)
  })

  it('rejects scores outside 0-100', () => {
    const bad = { ...VALID_SCORE, overall_score: 150 }
    const result = CandidateScoreSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects missing dimensions', () => {
    const { dimensions: _, ...bad } = VALID_SCORE
    const result = CandidateScoreSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects empty reasoning', () => {
    const bad = {
      ...VALID_SCORE,
      dimensions: {
        ...VALID_SCORE.dimensions,
        technical_skills: { score: 80, reasoning: '' },
      },
    }
    const result = CandidateScoreSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects empty summary', () => {
    const bad = { ...VALID_SCORE, summary: '' }
    const result = CandidateScoreSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
