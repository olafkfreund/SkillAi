/**
 * Unit tests for interview transcript parser
 *
 * Uses real fixture files in tests/fixtures/ for all formats.
 * No mocking — the subtitle package is lightweight and pure JS.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseTranscriptFile } from '@/lib/parsers/transcript'

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../../fixtures', name))

describe('parseTranscriptFile()', () => {
  describe('VTT format', () => {
    it('returns rawText and cues array', async () => {
      const buf = fixture('sample.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      expect(result.rawText).toBeTruthy()
      expect(Array.isArray(result.cues)).toBe(true)
      expect(result.cues.length).toBeGreaterThan(0)
    })

    it('extracts speaker names from <v Speaker> tags', async () => {
      const buf = fixture('sample.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      const speakers = result.cues.map((c) => c.speaker)
      expect(speakers).toContain('Interviewer')
      expect(speakers).toContain('Alice Smith')
    })

    it('converts timestamps to milliseconds', async () => {
      const buf = fixture('sample.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      expect(result.cues[0].timestamp).toBe(1000)
      expect(result.cues[1].timestamp).toBe(6000)
    })

    it('includes cue text without speaker tags', async () => {
      const buf = fixture('sample.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      const aliceCue = result.cues.find((c) => c.speaker === 'Alice Smith')
      expect(aliceCue?.text).toContain('TypeScript')
      expect(aliceCue?.text).not.toContain('<v')
    })

    it('handles Microsoft Teams VTT with UUID cue identifiers', async () => {
      const buf = fixture('sample-teams.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      expect(result.cues.length).toBe(4)
      expect(result.cues[0].speaker).toBe('Interviewer')
      expect(result.cues[1].speaker).toBe('Alice Smith')
      expect(result.cues[0].timestamp).toBe(1000)
      expect(result.cues[1].timestamp).toBe(6000)
    })
  })

  describe('SRT format', () => {
    it('returns rawText and cues array', async () => {
      const buf = fixture('sample.srt')
      const result = await parseTranscriptFile(buf, 'srt')
      expect(result.rawText).toBeTruthy()
      expect(Array.isArray(result.cues)).toBe(true)
      expect(result.cues.length).toBeGreaterThan(0)
    })

    it('extracts speaker names from "Name: text" prefix', async () => {
      const buf = fixture('sample.srt')
      const result = await parseTranscriptFile(buf, 'srt')
      const speakers = result.cues.map((c) => c.speaker)
      expect(speakers).toContain('Interviewer')
      expect(speakers).toContain('Alice Smith')
    })

    it('converts SRT timestamps (comma decimal) to milliseconds', async () => {
      const buf = fixture('sample.srt')
      const result = await parseTranscriptFile(buf, 'srt')
      expect(result.cues[0].timestamp).toBe(1000)
      expect(result.cues[1].timestamp).toBe(6000)
    })

    it('strips speaker prefix from cue text', async () => {
      const buf = fixture('sample.srt')
      const result = await parseTranscriptFile(buf, 'srt')
      const aliceCue = result.cues.find((c) => c.speaker === 'Alice Smith')
      expect(aliceCue?.text).not.toMatch(/^Alice Smith:/)
    })
  })

  describe('plain text / paste format', () => {
    it('returns rawText equal to input', async () => {
      const buf = fixture('sample-transcript.txt')
      const result = await parseTranscriptFile(buf, 'paste')
      expect(result.rawText).toBe(buf.toString('utf-8'))
    })

    it('produces a single cue with all text when no speaker pattern found', async () => {
      const buf = Buffer.from('No speakers here, just raw text.')
      const result = await parseTranscriptFile(buf, 'paste')
      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].speaker).toBe('Unknown')
      expect(result.cues[0].timestamp).toBe(0)
    })

    it('extracts speaker turns from "Name: text" lines in plain text', async () => {
      const buf = fixture('sample-transcript.txt')
      const result = await parseTranscriptFile(buf, 'paste')
      const speakers = result.cues.map((c) => c.speaker)
      expect(speakers).toContain('Interviewer')
      expect(speakers).toContain('Alice Smith')
    })
  })

  describe('txt format (same as paste)', () => {
    it('handles txt format identically to paste', async () => {
      const buf = fixture('sample-transcript.txt')
      const pasteResult = await parseTranscriptFile(buf, 'paste')
      const txtResult = await parseTranscriptFile(buf, 'txt')
      expect(txtResult.cues.length).toBe(pasteResult.cues.length)
      expect(txtResult.rawText).toBe(pasteResult.rawText)
    })
  })

  describe('rawText content', () => {
    it('VTT rawText contains all spoken content', async () => {
      const buf = fixture('sample.vtt')
      const result = await parseTranscriptFile(buf, 'vtt')
      expect(result.rawText).toContain('TypeScript')
      expect(result.rawText).toContain('Alice Smith')
    })

    it('SRT rawText contains all spoken content', async () => {
      const buf = fixture('sample.srt')
      const result = await parseTranscriptFile(buf, 'srt')
      expect(result.rawText).toContain('TypeScript')
    })
  })
})
