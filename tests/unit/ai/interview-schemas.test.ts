import { describe, it, expect } from 'vitest'
import { CvProfileSchema, InterviewPackSchema } from '@/lib/ai/interview-schemas'
import { inferExperienceLevel, inferLanguage } from '@/lib/ai/interview-helpers'

const VALID_PROFILE = {
  experience_level: 'senior',
  companies: [
    {
      name: 'TechCorp',
      role: 'Senior Engineer',
      key_achievements: ['Led platform migration', 'Reduced latency by 40%'],
    },
  ],
  technical_skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  personalizable_moments: ['Led a team of 8 during platform migration'],
}

const VALID_QUESTION = {
  question_type: 'behavioral',
  difficulty: 'medium',
  question_text: 'Tell me about the platform migration you led at TechCorp.',
  rationale: 'Assesses leadership and technical decision-making.',
  follow_ups: [{ question: 'What was the biggest risk you encountered?' }],
  strong_answer_signals: ['Structured approach', 'Clear metrics'],
  acceptable_answer_signals: ['Described the outcome'],
  weak_answer_signals: ['Vague or generic response'],
  cv_references: ['Led platform migration at TechCorp'],
}

const VALID_PACK = {
  experience_level: 'senior',
  recommended_duration_minutes: 60,
  questions: Array(6).fill(VALID_QUESTION),
}

// -- CvProfileSchema --
describe('CvProfileSchema', () => {
  it('parses a valid profile', () => {
    expect(CvProfileSchema.safeParse(VALID_PROFILE).success).toBe(true)
  })

  it('rejects invalid experience_level', () => {
    const bad = { ...VALID_PROFILE, experience_level: 'expert' }
    expect(CvProfileSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects companies array exceeding 5', () => {
    const bad = { ...VALID_PROFILE, companies: Array(6).fill(VALID_PROFILE.companies[0]) }
    expect(CvProfileSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts profile without experience_level (optional)', () => {
    const { experience_level: _, ...noLevel } = VALID_PROFILE
    expect(CvProfileSchema.safeParse(noLevel).success).toBe(true)
  })
})

// -- InterviewPackSchema --
describe('InterviewPackSchema', () => {
  it('parses a valid pack with 6 questions', () => {
    expect(InterviewPackSchema.safeParse(VALID_PACK).success).toBe(true)
  })

  it('rejects fewer than 6 questions', () => {
    const bad = { ...VALID_PACK, questions: Array(5).fill(VALID_QUESTION) }
    expect(InterviewPackSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects invalid question_type', () => {
    const badQ = { ...VALID_QUESTION, question_type: 'personal' }
    const bad = { ...VALID_PACK, questions: Array(6).fill(badQ) }
    expect(InterviewPackSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects follow_ups exceeding 2 items', () => {
    const badQ = {
      ...VALID_QUESTION,
      follow_ups: [{ question: 'A' }, { question: 'B' }, { question: 'C' }],
    }
    const bad = { ...VALID_PACK, questions: Array(6).fill(badQ) }
    expect(InterviewPackSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts pack with optional code_challenge', () => {
    const withChallenge = {
      ...VALID_PACK,
      code_challenge: {
        title: 'Array sum',
        problem_description: 'Sum all elements.',
        starter_code: 'function sum(arr) {}',
        language: 'TypeScript',
        unit_tests: 'expect(sum([1,2])).toBe(3)',
        evaluation_criteria: 'Correctness + complexity',
        estimated_minutes: 30,
      },
    }
    expect(InterviewPackSchema.safeParse(withChallenge).success).toBe(true)
  })
})

// -- inferExperienceLevel --
describe('inferExperienceLevel()', () => {
  it('"8 years" → senior', () => {
    expect(inferExperienceLevel('8 years of experience in TypeScript')).toBe('senior')
  })

  it('"2 years" → junior', () => {
    expect(inferExperienceLevel('2 years experience')).toBe('junior')
  })

  it('"Senior Engineer" title → senior', () => {
    expect(inferExperienceLevel('Senior Engineer at BigCo')).toBe('senior')
  })

  it('"Lead Developer" → lead', () => {
    expect(inferExperienceLevel('Lead Developer with 10+ years')).toBe('lead')
  })

  it('no indicators → mid', () => {
    expect(inferExperienceLevel('Worked on web applications')).toBe('mid')
  })
})

// -- inferLanguage --
describe('inferLanguage()', () => {
  it('TypeScript in skills → TypeScript', () => {
    expect(inferLanguage(['TypeScript', 'React', 'Node.js'])).toBe('TypeScript')
  })

  it('Python only → Python', () => {
    expect(inferLanguage(['Python', 'Django', 'FastAPI'])).toBe('Python')
  })

  it('empty skills → TypeScript (default)', () => {
    expect(inferLanguage([])).toBe('TypeScript')
  })
})
