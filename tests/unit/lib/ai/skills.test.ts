import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock `node:fs` so we can both (a) drive content from the test and (b)
// observe whether the module-level cache is short-circuiting subsequent
// reads. `vi.hoisted` is required because the factory passed to `vi.mock`
// is lifted above any top-level `const`s.
const { mockReadFileSync, fileContents } = vi.hoisted(() => {
  const fileContents: Record<string, string> = {
    'talent-acquisition.md':
      '# Talent Acquisition\n\nMock talent-acquisition content. ' +
      'Lorem ipsum '.repeat(80),
    'people-analytics.md':
      '# People Analytics\n\nMock people-analytics content. ' +
      'Lorem ipsum '.repeat(80),
    'eu-uk-supplement.md':
      '# EU/UK Right-to-Work Supplement\n\nMock supplement content. ' +
      'Lorem ipsum '.repeat(80),
  }
  return {
    fileContents,
    mockReadFileSync: vi.fn((p: string) => {
      const name = (p.split('/').pop() ?? p) as keyof typeof fileContents
      const body = fileContents[name]
      if (body === undefined) {
        throw new Error(`Unexpected file read: ${p}`)
      }
      return body
    }),
  }
})

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

// IMPORTANT: import the SUT AFTER the mock so the mocked `node:fs` is in scope.
// We re-import inside each test via dynamic import + `vi.resetModules()` where
// cache behaviour matters; here we get one shared import for shape assertions.
import { loadHrSkill } from '@/lib/ai/skills'

describe('loadHrSkill', () => {
  beforeEach(() => {
    mockReadFileSync.mockClear()
  })

  it('returns name + content for the talent-acquisition profile', () => {
    const result = loadHrSkill('talent-acquisition')
    expect(result!.name).toBe('talent-acquisition')
    expect(result!.content.length).toBeGreaterThan(100)
    expect(result!.content).toContain('# Talent Acquisition')
  })

  it('returns name + content for the people-analytics profile', () => {
    const result = loadHrSkill('people-analytics')
    expect(result!.name).toBe('people-analytics')
    expect(result!.content.length).toBeGreaterThan(100)
    expect(result!.content).toContain('# People Analytics')
  })

  it('combines talent-acquisition + eu-uk-supplement for recruiter-eu-uk', () => {
    const result = loadHrSkill('recruiter-eu-uk')
    expect(result!.name).toBe('recruiter-eu-uk')
    // Both source files' headings show up in the combined content.
    expect(result!.content).toContain('# Talent Acquisition')
    expect(result!.content).toContain('# EU/UK Right-to-Work Supplement')
    // Separator between the two files.
    expect(result!.content).toContain('\n\n---\n\n')
    // Reasonable combined size: >500 B (lower than concatenated mock content)
    // and <50 KB (so we never serialise an absurd system prompt).
    expect(result!.content.length).toBeGreaterThan(500)
    expect(result!.content.length).toBeLessThan(50_000)
  })

  it('caches per-profile and does not re-read fs on a second call', async () => {
    // Reset modules so we get a fresh module-scope cache for this test only,
    // independent of the calls the earlier tests have already made.
    vi.resetModules()
    mockReadFileSync.mockClear()

    const { loadHrSkill: freshLoad } = await import('@/lib/ai/skills')

    // First call should hit fs for talent-acquisition.md (1 read).
    const first = freshLoad('talent-acquisition')
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)

    // Second call MUST be served from cache → call count unchanged.
    const second = freshLoad('talent-acquisition')
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)

    // Same object instance returned from cache (we use Map.get, not a copy).
    expect(second).toBe(first)

    // A different profile triggers exactly the new reads it needs.
    freshLoad('recruiter-eu-uk')
    // recruiter-eu-uk reads talent-acquisition.md (cached upstream? no — the
    // helper reads via fs each composition; what's cached is the resulting
    // LoadedSkill object per profile, not the underlying file). So the
    // composition reads talent-acquisition.md again + eu-uk-supplement.md →
    // +2 reads.
    expect(mockReadFileSync).toHaveBeenCalledTimes(3)

    // And a second call for recruiter-eu-uk hits cache, no further reads.
    freshLoad('recruiter-eu-uk')
    expect(mockReadFileSync).toHaveBeenCalledTimes(3)
  })
})
