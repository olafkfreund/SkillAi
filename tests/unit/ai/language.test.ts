import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  getDisplayName,
  formatLanguageDirective,
  TOOL_LANGUAGE_REINFORCEMENT,
} from '@/lib/ai/language'

describe('SUPPORTED_LANGUAGES', () => {
  it('contains all 10 v1 supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'en', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'cs', 'sv',
    ])
  })
})

describe('isSupportedLanguage', () => {
  it('returns true for supported codes', () => {
    expect(isSupportedLanguage('pl')).toBe(true)
    expect(isSupportedLanguage('en')).toBe(true)
  })
  it('returns false for non-string', () => {
    expect(isSupportedLanguage(123)).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
  })
  it('returns false for unsupported codes', () => {
    expect(isSupportedLanguage('zh')).toBe(false)
    expect(isSupportedLanguage('en-US')).toBe(false)
    expect(isSupportedLanguage('made-up')).toBe(false)
  })
})

describe('getDisplayName', () => {
  it('resolves Polish name in English', () => {
    expect(getDisplayName('pl')).toBe('Polish')
  })
  it('resolves German name in English', () => {
    expect(getDisplayName('de')).toBe('German')
  })
  it('resolves Polish name in Polish (native)', () => {
    expect(getDisplayName('pl', 'pl').toLowerCase()).toContain('polsk')
  })
})

describe('formatLanguageDirective', () => {
  it('returns empty string for English (regression-safe)', () => {
    expect(formatLanguageDirective('en')).toBe('')
  })

  it('returns a directive block for Polish that includes the Pan/Pani clause', () => {
    const out = formatLanguageDirective('pl')
    expect(out).toContain('RESPONSE LANGUAGE: Generate ALL output in Polish (pl)')
    expect(out).toContain('Pan/Pani')
    expect(out).toContain('Field names stay in English')
    expect(out).toContain('Keep proper nouns and established technical terms in English')
  })

  it('returns a directive block for German that includes the Sie clause', () => {
    const out = formatLanguageDirective('de')
    expect(out).toContain('Generate ALL output in German (de)')
    expect(out).toContain('Sie')
  })

  it('returns a directive block for French that includes the vous clause', () => {
    const out = formatLanguageDirective('fr')
    expect(out).toContain('vous')
  })

  it('returns a directive without formal-register clause for Dutch (no strong distinction needed)', () => {
    const out = formatLanguageDirective('nl')
    expect(out).toContain('RESPONSE LANGUAGE')
    expect(out).not.toContain('Pan/Pani')
    expect(out).not.toContain('Sie / Ihr')
  })

  it('starts with a leading blank line for prompt separation', () => {
    expect(formatLanguageDirective('pl').startsWith('\n')).toBe(true)
  })

  it('mentions Kubernetes/GraphQL etc. as proper-noun examples', () => {
    const out = formatLanguageDirective('pl')
    expect(out).toContain('Kubernetes')
    expect(out).toContain('GraphQL')
  })
})

describe('TOOL_LANGUAGE_REINFORCEMENT', () => {
  it('reinforces field-name-vs-value rule', () => {
    expect(TOOL_LANGUAGE_REINFORCEMENT).toContain('Field NAMES')
    expect(TOOL_LANGUAGE_REINFORCEMENT).toContain('English')
  })
})
