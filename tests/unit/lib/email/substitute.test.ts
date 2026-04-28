/**
 * Unit tests for src/lib/email/substitute.ts
 *
 * Pure function — no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { substituteTemplate } from '@/lib/email/substitute'

describe('substituteTemplate', () => {
  it('replaces a simple {{key}} placeholder', () => {
    const result = substituteTemplate('Hello {{name}}!', { name: 'Alice' })
    expect(result).toBe('Hello Alice!')
  })

  it('replaces {{ key }} with surrounding whitespace', () => {
    const result = substituteTemplate('Hi {{ candidate.firstName }},', {
      'candidate.firstName': 'Bob',
    })
    expect(result).toBe('Hi Bob,')
  })

  it('replaces multiple occurrences of the same variable', () => {
    const result = substituteTemplate(
      '{{x}} and {{x}} and {{x}}',
      { x: 'foo' }
    )
    expect(result).toBe('foo and foo and foo')
  })

  it('replaces missing keys with an empty string', () => {
    const result = substituteTemplate('Dear {{candidate.firstName}} {{candidate.lastName}},', {
      'candidate.firstName': 'Jane',
      // candidate.lastName intentionally absent
    })
    expect(result).toBe('Dear Jane ,')
  })

  it('handles escaped \\{{ as a literal {{ without substitution', () => {
    const result = substituteTemplate('Use \\{{key}} to template', { key: 'replaced' })
    expect(result).toBe('Use {{key}} to template')
  })

  it('substitutes dot-notation keys as flat strings', () => {
    const result = substituteTemplate(
      '{{role.title}} at {{tenant.name}}',
      { 'role.title': 'Senior Engineer', 'tenant.name': 'Acme Corp' }
    )
    expect(result).toBe('Senior Engineer at Acme Corp')
  })

  it('returns the original string unchanged when vars map is empty', () => {
    const template = 'No substitutions here.'
    expect(substituteTemplate(template, {})).toBe(template)
  })

  it('replaces multiple different variables in a single pass', () => {
    const result = substituteTemplate(
      'Hi {{candidate.firstName}}, the role is {{role.title}}.',
      { 'candidate.firstName': 'Carol', 'role.title': 'DevOps Lead' }
    )
    expect(result).toBe('Hi Carol, the role is DevOps Lead.')
  })
})
