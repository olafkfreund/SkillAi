import { describe, it, expect } from 'vitest'
import { formatManagerPriorities } from '@/lib/ai/priorities'

describe('formatManagerPriorities', () => {
  it('returns empty string for empty array (regression-safe)', () => {
    expect(formatManagerPriorities([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(formatManagerPriorities(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatManagerPriorities(undefined)).toBe('')
  })

  it('returns empty string when all entries are whitespace', () => {
    expect(formatManagerPriorities(['  ', '\t', ''])).toBe('')
  })

  it('builds the priorities block for a single phrase', () => {
    const out = formatManagerPriorities(['Self-starting'])
    expect(out).toContain('MANAGER PRIORITIES (soft signals')
    expect(out).toContain('- Self-starting')
    expect(out).toContain('do NOT directly penalize or boost overall_score')
  })

  it('renders multiple phrases as bullets in input order', () => {
    const out = formatManagerPriorities([
      'Engineer who codes',
      'Self-starting',
      'Uses Claude Code',
    ])
    expect(out).toContain('- Engineer who codes')
    expect(out).toContain('- Self-starting')
    expect(out).toContain('- Uses Claude Code')
    // Order preserved
    expect(out.indexOf('Engineer who codes')).toBeLessThan(out.indexOf('Self-starting'))
    expect(out.indexOf('Self-starting')).toBeLessThan(out.indexOf('Uses Claude Code'))
  })

  it('trims whitespace from each phrase', () => {
    const out = formatManagerPriorities(['  Self-starting  ', '\tUses Claude Code\n'])
    expect(out).toContain('- Self-starting')
    expect(out).toContain('- Uses Claude Code')
    expect(out).not.toContain('-   Self-starting')
  })

  it('drops whitespace-only entries from a mixed array', () => {
    const out = formatManagerPriorities(['Self-starting', '   ', 'Uses Claude Code'])
    expect(out).toContain('- Self-starting')
    expect(out).toContain('- Uses Claude Code')
    expect(out).not.toContain('-   ')
    expect(out).not.toContain('- \n')
  })

  it('starts with a blank line for prompt separation', () => {
    const out = formatManagerPriorities(['x'])
    expect(out.startsWith('\n')).toBe(true)
  })
})
