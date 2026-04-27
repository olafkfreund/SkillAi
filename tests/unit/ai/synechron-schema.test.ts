/**
 * Unit tests for SynechronCvDataSchema
 *
 * Pure Zod schema validation — no DB, no AI, no mocks.
 * Asserts shape acceptance/rejection only; never asserts exact error
 * message text so internal Zod messages can change without breaking us.
 */

import { describe, it, expect } from 'vitest'
import { SynechronCvDataSchema } from '@/lib/ai/synechron-schema'

describe('SynechronCvDataSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = SynechronCvDataSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a fully-populated CV', () => {
    const fixture = {
      candidateName: 'Jane Doe',
      jobTitle: 'Senior Engineer',
      overallExperience: '12+ years',
      relevantExperience: '8 years',
      skillsCategorised: [{ category: 'Languages', skills: ['Go', 'TypeScript'] }],
      domains: ['Banking'],
      achievements: ['Promoted to staff'],
      education: [{ degree: 'BSc CS', institution: 'MIT', year: '2014' }],
      visa: 'US Citizen',
      trainingCertifications: ['AWS SAA'],
      synopsisBullets: ['Tech lead'],
      employmentHistory: [
        {
          company: 'Acme',
          role: 'Senior Engineer',
          dates: 'Jan 2020 – Present',
          teamSize: '8 engineers',
          client: 'Internal',
          duration: '4 years',
          description: 'Built things',
          responsibilities: ['Code review'],
          skills: ['Go'],
        },
      ],
    }
    const result = SynechronCvDataSchema.safeParse(fixture)
    expect(result.success).toBe(true)
  })

  it('rejects skillsCategorised entry missing required category', () => {
    const result = SynechronCvDataSchema.safeParse({
      skillsCategorised: [{ skills: ['Go'] }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects education entry missing required institution', () => {
    const result = SynechronCvDataSchema.safeParse({
      education: [{ degree: 'BSc CS', year: '2014' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts education entry without optional year', () => {
    const result = SynechronCvDataSchema.safeParse({
      education: [{ degree: 'BSc CS', institution: 'MIT' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects wrong shape (string where array expected)', () => {
    const result = SynechronCvDataSchema.safeParse({ domains: 'Banking' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty employmentHistory array', () => {
    const result = SynechronCvDataSchema.safeParse({ employmentHistory: [] })
    expect(result.success).toBe(true)
  })

  it('accepts employmentHistory entry where every sub-field is optional', () => {
    // Each employment entry has all-optional fields; an empty object is valid.
    const result = SynechronCvDataSchema.safeParse({
      employmentHistory: [{}],
    })
    expect(result.success).toBe(true)
  })
})
