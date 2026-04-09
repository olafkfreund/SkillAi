/**
 * Unit tests for CV file parsers
 *
 * Uses fixture files in tests/fixtures/ — no mocking of the parser libs.
 * PDF and DOCX tests mock the underlying libraries (pdf-parse / mammoth)
 * since generating valid binary fixtures inline is complex.
 * ODT, RTF, TXT, MD tests use real fixture files.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseFile, ParseError } from '@/lib/parsers'

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../../fixtures', name))

// -- Mock pdf-parse and mammoth for PDF/DOCX tests --
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'PDF extracted text content' }),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: 'DOCX extracted text content' }),
}))

describe('parseFile()', () => {
  describe('PDF', () => {
    it('returns extracted text from pdf-parse', async () => {
      const result = await parseFile(Buffer.from('fake-pdf'), 'pdf')
      expect(result).toBe('PDF extracted text content')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('DOCX', () => {
    it('returns extracted text from mammoth', async () => {
      const result = await parseFile(Buffer.from('fake-docx'), 'docx')
      expect(result).toBe('DOCX extracted text content')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('TXT', () => {
    it('returns exact file content as UTF-8 string', async () => {
      const buf = fixture('sample.txt')
      const result = await parseFile(buf, 'txt')
      expect(result).toContain('John Smith')
      expect(result).toContain('TypeScript')
    })
  })

  describe('MD', () => {
    it('returns file content as string (preserves markdown)', async () => {
      const buf = fixture('sample.md')
      const result = await parseFile(buf, 'md')
      expect(result).toContain('Jane Doe')
      expect(result).toContain('TypeScript')
    })
  })

  describe('ODT', () => {
    it('extracts plain text from ODT fixture', async () => {
      const buf = fixture('sample.odt')
      const result = await parseFile(buf, 'odt')
      expect(result).toContain('Sarah Connor')
      expect(result.length).toBeGreaterThan(10)
    })
  })

  describe('RTF', () => {
    it('extracts plain text from RTF fixture', async () => {
      const buf = fixture('sample.rtf')
      const result = await parseFile(buf, 'rtf')
      expect(result).toContain('Alex Johnson')
      expect(result.length).toBeGreaterThan(10)
    })
  })

  describe('Unsupported types', () => {
    it('throws ParseError for unknown extension', async () => {
      await expect(
        parseFile(Buffer.from('data'), 'xls' as never)
      ).rejects.toThrow(ParseError)
    })

    it('ParseError message includes the unsupported type', async () => {
      await expect(
        parseFile(Buffer.from('data'), 'xls' as never)
      ).rejects.toThrow('xls')
    })
  })
})
