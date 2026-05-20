/**
 * CV text formatter — turns the raw `candidates.cv_text` blob (often a
 * single-line dump from `pdf-parse`) into a structured list of blocks
 * for the candidate PDF renderer.
 *
 * Block types:
 *   - heading:  a top-level CV section (TECHNICAL SKILLS, EMPLOYMENT HISTORY, …)
 *   - subheading: a "Label : value" pattern within a section
 *   - paragraph: body text
 *   - bullet:   a list item (line starting with •, -, *, or numbered)
 *
 * Also handles the case where `cv_text_formatted` (AI-cleaned markdown) is
 * available — strips simple markdown markers (`# `, `## `, `- `) and emits
 * the corresponding block types.
 */

export type CvBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }

/** Common CV section headings — match case-insensitively, anchored to a word boundary. */
const SECTION_HEADINGS = [
  'OVERALL EXPERIENCE',
  'RELEVANT EXPERIENCE',
  'PROFESSIONAL EXPERIENCE',
  'EMPLOYMENT HISTORY',
  'WORK HISTORY',
  'WORK EXPERIENCE',
  'CAREER HISTORY',
  'TECHNICAL SKILLS',
  'CORE SKILLS',
  'KEY SKILLS',
  'TECHNICAL EXPERTISE',
  'SKILLS',
  'EDUCATION',
  'ACADEMIC BACKGROUND',
  'CERTIFICATIONS',
  'CERTIFICATES',
  'TRAINING',
  'COURSES',
  'PROJECTS',
  'KEY PROJECTS',
  'NOTABLE PROJECTS',
  'ACHIEVEMENTS',
  'KEY ACHIEVEMENTS',
  'ACCOMPLISHMENTS',
  'PUBLICATIONS',
  'PATENTS',
  'AWARDS',
  'HONORS',
  'PROFESSIONAL SUMMARY',
  'EXECUTIVE SUMMARY',
  'SUMMARY',
  'PROFILE',
  'OBJECTIVE',
  'CAREER OBJECTIVE',
  'LANGUAGES',
  'LANGUAGE SKILLS',
  'REFERENCES',
  'INTERESTS',
  'VOLUNTEER EXPERIENCE',
  'VOLUNTEERING',
  'CONTACT',
  'CONTACT DETAILS',
  'PERSONAL DETAILS',
]

/**
 * Inject newlines before known section headings in a single-line CV blob.
 * Case-insensitive match. Adds a marker `\n§SECTION§ HEADING\n` so the parser
 * can pick them out unambiguously even when the raw text already had spaces.
 */
function injectSectionBreaks(raw: string): string {
  // Sort by length DESC so longer phrases match before their prefixes.
  // Single alternated regex with global flag — JavaScript's alternation
  // tries options left-to-right, so DESC-sorted longer headings win over
  // their shorter prefixes ("PROFESSIONAL EXPERIENCE" before "EXPERIENCE").
  // A single pass avoids the bug where a second iteration re-matches the
  // shorter prefix INSIDE an already-wrapped longer match.
  const sorted = [...SECTION_HEADINGS].sort((a, b) => b.length - a.length)
  const pattern = sorted.map((h) => h.replace(/ /g, '\\s+')).join('|')
  const re = new RegExp(`\\b(${pattern})\\b\\s*:?`, 'gi')

  return raw.replace(re, (match) => `\n§SECTION§ ${match.replace(/\s*:$/, '').trim()}\n`)
}

/** Strip simple markdown into normalised line-per-block form. */
function normaliseMarkdown(text: string): string {
  return text
    .replace(/^#{1,2}\s+(.+)$/gm, '\n§SECTION§ $1\n')
    .replace(/^#{3,6}\s+(.+)$/gm, '\n§SUBHEAD§ $1\n')
    .replace(/^\s*[-*]\s+(.+)$/gm, '§BULLET§ $1')
    .replace(/\*\*(.+?)\*\*/g, '$1') // drop bold markers; react-pdf doesn't render inline styles cheaply
    .replace(/[_*]([^_*\n]+?)[_*]/g, '$1') // drop italic markers
}

/**
 * Parse a CV blob (raw text OR cv_text_formatted markdown) into ordered blocks.
 *
 * Algorithm:
 * 1. If the input looks like markdown (contains `# `, `## `, or `- ` at line starts),
 *    normalise the markdown markers into `§SECTION§` / `§SUBHEAD§` / `§BULLET§`.
 * 2. Otherwise, inject `§SECTION§` markers before known CV section headings.
 * 3. Split on `\n`, dispatch each line to a block by marker / leading-char heuristic.
 *
 * Lines without markers become paragraphs. Empty lines split paragraphs but don't
 * emit a block themselves.
 */
export function parseCvBlocks(input: string): CvBlock[] {
  if (!input || !input.trim()) return []

  const isMarkdown = /^#{1,6}\s|^\s*[-*]\s/m.test(input)
  const normalised = isMarkdown ? normaliseMarkdown(input) : injectSectionBreaks(input)

  const lines = normalised.split(/\n+/).map((l) => l.trim()).filter(Boolean)

  const blocks: CvBlock[] = []

  for (const line of lines) {
    if (line.startsWith('§SECTION§ ')) {
      blocks.push({ type: 'heading', text: line.slice('§SECTION§ '.length).trim() })
      continue
    }
    if (line.startsWith('§SUBHEAD§ ')) {
      blocks.push({ type: 'subheading', text: line.slice('§SUBHEAD§ '.length).trim() })
      continue
    }
    if (line.startsWith('§BULLET§ ')) {
      blocks.push({ type: 'bullet', text: line.slice('§BULLET§ '.length).trim() })
      continue
    }
    // Heuristic: a leading "•" or "- " on a line = bullet
    const bulletMatch = line.match(/^[•\-*]\s*(.+)$/)
    if (bulletMatch) {
      blocks.push({ type: 'bullet', text: bulletMatch[1].trim() })
      continue
    }
    // Heuristic: numbered list "1. text" or "1) text"
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/)
    if (numberedMatch) {
      blocks.push({ type: 'bullet', text: numberedMatch[1].trim() })
      continue
    }
    blocks.push({ type: 'paragraph', text: line })
  }

  return blocks
}
