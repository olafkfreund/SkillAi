import { describe, expect, it } from 'vitest'
import { asciiFallback, contentDispositionHeader } from '@/lib/http/content-disposition'

describe('contentDispositionHeader', () => {
  it('produces a ByteString-safe value for plain ASCII names', () => {
    const header = contentDispositionHeader('attachment', 'interview-pack-Alice-Smith.pdf')
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow()
    expect(header).toContain('filename="interview-pack-Alice-Smith.pdf"')
    expect(header).toContain("filename*=UTF-8''interview-pack-Alice-Smith.pdf")
  })

  it('survives the bug that hit production: Polish name with ż', () => {
    // The original crash: `Content-Disposition: filename="${candidateName}.pdf"`
    // with candidateName containing 'ż' (U+017C, decimal 380) throws
    // TypeError before the response ever leaves the server.
    const header = contentDispositionHeader('attachment', 'interview-pack-Małgorzata-Żurawski.pdf')
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow()
    // ASCII fallback strips characters NFKD can't decompose to ASCII (ł has
    // no precomposed ASCII equivalent, so it's dropped). The accented Ż
    // decomposes to Z + combining dot, leaving Z. Readable, not pretty.
    expect(header).toMatch(/filename="interview-pack-Magorzata-Zurawski\.pdf"/)
    // RFC 5987 extended form preserves the original Unicode via percent-encoding
    expect(header).toMatch(/filename\*=UTF-8''interview-pack-Ma%C5%82gorzata-%C5%BBurawski\.pdf/)
  })

  it('falls back to "download" when sanitisation strips everything', () => {
    const header = contentDispositionHeader('attachment', '中文文件名.pdf')
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow()
    expect(header).toContain('filename="download"')
    expect(header).toMatch(/filename\*=UTF-8''/)
  })

  it('uses inline disposition for inline previews', () => {
    const header = contentDispositionHeader('inline', 'role-Senior-Engineer.pdf')
    expect(header.startsWith('inline;')).toBe(true)
  })
})

describe('asciiFallback', () => {
  it('passes through clean ASCII', () => {
    expect(asciiFallback('hello-world.pdf')).toBe('hello-world.pdf')
  })

  it('strips diacritics via NFKD decomposition', () => {
    expect(asciiFallback('Małgorzata')).toBe('Magorzata') // ł has no ASCII letter after NFKD
    expect(asciiFallback('Żurawski')).toBe('Zurawski') // Ż decomposes to Z + combining dot
    expect(asciiFallback('Wójcik')).toBe('Wojcik') // ó decomposes to o + acute
  })

  it('collapses whitespace and hyphens', () => {
    expect(asciiFallback('  alice   smith  ')).toBe('alice-smith')
    expect(asciiFallback('a---b')).toBe('a-b')
  })

  it('returns empty for input with only non-ASCII chars', () => {
    expect(asciiFallback('中文')).toBe('')
    expect(asciiFallback('🎉🎊')).toBe('')
  })
})
