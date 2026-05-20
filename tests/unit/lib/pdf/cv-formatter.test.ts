import { describe, it, expect } from 'vitest'
import { parseCvBlocks } from '@/lib/pdf/cv-formatter'

describe('parseCvBlocks — raw CV text (no newlines)', () => {
  it('injects section breaks before known CV headings (Alex Dolia case)', () => {
    // Real case from production: pdf-parse extracted the CV as a single line.
    const raw =
      'OVERALL EXPERIENCE : 15+ Years RELEVANT EXPERIENCE : 10 Years ' +
      'TECHNICAL SKILLS Information Retrieval & Ranking : Ranking ' +
      'EMPLOYMENT HISTORY Senior Data Scientist | Nov 2025 - Present Severn Trent ' +
      'EDUCATION MSc Computer Science'

    const blocks = parseCvBlocks(raw)
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)

    expect(headings).toContain('OVERALL EXPERIENCE')
    expect(headings).toContain('RELEVANT EXPERIENCE')
    expect(headings).toContain('TECHNICAL SKILLS')
    expect(headings).toContain('EMPLOYMENT HISTORY')
    expect(headings).toContain('EDUCATION')
  })

  it('returns paragraphs when no known headings are present', () => {
    const raw = 'Just a plain paragraph of free-form text with no obvious structure.'
    const blocks = parseCvBlocks(raw)
    expect(blocks).toEqual([{ type: 'paragraph', text: raw }])
  })

  it('returns empty array for empty input', () => {
    expect(parseCvBlocks('')).toEqual([])
    expect(parseCvBlocks('   ')).toEqual([])
  })

  it('matches the longer of two overlapping headings first', () => {
    // "PROFESSIONAL EXPERIENCE" should match as a unit, not split into
    // "EXPERIENCE" alone (which would also be a valid match).
    const raw = 'X X X PROFESSIONAL EXPERIENCE Senior Engineer at FooCorp ...'
    const blocks = parseCvBlocks(raw)
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toEqual(['PROFESSIONAL EXPERIENCE'])
  })

  it('handles trailing colon after section heading', () => {
    const raw = 'X X SKILLS: Python, TypeScript EDUCATION: BSc CS'
    const blocks = parseCvBlocks(raw)
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    expect(headings).toContain('SKILLS')
    expect(headings).toContain('EDUCATION')
  })
})

describe('parseCvBlocks — markdown input', () => {
  it('renders # / ## headings as heading and subheading blocks', () => {
    const md = '# Profile\nSenior engineer.\n## Experience\nWorked at FooCorp.'
    const blocks = parseCvBlocks(md)
    expect(blocks).toEqual([
      { type: 'heading', text: 'Profile' },
      { type: 'paragraph', text: 'Senior engineer.' },
      { type: 'heading', text: 'Experience' },
      { type: 'paragraph', text: 'Worked at FooCorp.' },
    ])
  })

  it('renders ### as subheading', () => {
    const md = '### Job Title\nDescription here.'
    const blocks = parseCvBlocks(md)
    expect(blocks).toEqual([
      { type: 'subheading', text: 'Job Title' },
      { type: 'paragraph', text: 'Description here.' },
    ])
  })

  it('renders - and * lines as bullets', () => {
    const md = '## Skills\n- Python\n- TypeScript\n* Rust'
    const blocks = parseCvBlocks(md)
    expect(blocks).toEqual([
      { type: 'heading', text: 'Skills' },
      { type: 'bullet', text: 'Python' },
      { type: 'bullet', text: 'TypeScript' },
      { type: 'bullet', text: 'Rust' },
    ])
  })

  it('strips bold/italic markers from paragraph text', () => {
    const md = '## Section\nThis is **bold** and *italic* and _emphasised_.'
    const blocks = parseCvBlocks(md)
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      text: 'This is bold and italic and emphasised.',
    })
  })
})

describe('parseCvBlocks — bullet detection in raw text', () => {
  it('detects • marker', () => {
    const raw = '• First item\n• Second item'
    const blocks = parseCvBlocks(raw)
    expect(blocks).toEqual([
      { type: 'bullet', text: 'First item' },
      { type: 'bullet', text: 'Second item' },
    ])
  })

  it('detects numbered lists', () => {
    const raw = '1. First\n2. Second\n3) Third'
    const blocks = parseCvBlocks(raw)
    expect(blocks).toEqual([
      { type: 'bullet', text: 'First' },
      { type: 'bullet', text: 'Second' },
      { type: 'bullet', text: 'Third' },
    ])
  })
})
