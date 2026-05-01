'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// ─── Known section-header words (used for single-word ALL-CAPS detection) ────
const SECTION_WORDS = new Set([
  'SUMMARY', 'PROFILE', 'OBJECTIVE', 'OVERVIEW', 'ABOUT',
  'EXPERIENCE', 'EMPLOYMENT', 'HISTORY', 'CAREER',
  'EDUCATION', 'QUALIFICATIONS', 'TRAINING', 'ACADEMIC',
  'SKILLS', 'COMPETENCIES', 'EXPERTISE',
  'PROJECTS', 'PORTFOLIO', 'ACHIEVEMENTS', 'ACCOMPLISHMENTS',
  'CERTIFICATIONS', 'CERTIFICATES', 'AWARDS', 'PUBLICATIONS',
  'LANGUAGES', 'INTERESTS', 'HOBBIES', 'REFERENCES',
  'VOLUNTEERING', 'ACTIVITIES',
])

// ─── Pre-processor: inject line structure into flat PDF-extracted text ────────
//
// PDF text extraction (pdf-parse) often strips all newlines, producing a single
// long string. We reconstruct structure by detecting embedded signals:
//   1. Contact labels (Phone:, Email:, etc.)
//   2. Bullet chars (●, •, ▪, ◆, →)
//   3. ALL-CAPS multi-word phrases → section headers
//   4. Known single-word ALL-CAPS section headers
//   5. Stranded headers at end of lines

function preprocessCv(raw: string): string {
  const existingLines = raw.split('\n').filter((l) => l.trim())
  const avgLineLen = existingLines.length > 0 ? raw.length / existingLines.length : raw.length

  // Already structured: avg line < 120 chars and 12+ lines → just normalize bullets
  if (existingLines.length >= 12 && avgLineLen < 120) {
    return raw
      .replace(/\s*(●|•|▪|◆|→)\s*/g, '\n● ')
  }

  let t = raw

  // 1. Split known contact labels to their own lines
  t = t.replace(
    /\s+(Location|Phone|Mobile|Tel|Email|LinkedIn|Website|GitHub|Portfolio|Address):/gi,
    '\n$1:'
  )

  // 2. Normalize bullet characters: each gets its own line
  t = t.replace(/\s*(●|•|▪|◆|→)\s*/g, '\n● ')

  // 3. Insert newlines before ALL-CAPS multi-word section headers.
  //    Requires 2+ consecutive all-caps words (3+ chars each).
  //    Preceded by any non-uppercase, non-newline character.
  t = t.replace(
    /([^A-Z\n])\s+([A-Z]{3,}(?:[\s&/()\-]+[A-Z]{3,})+)/g,
    '$1\n\n$2'
  )

  // 4. Insert newlines before known single-word ALL-CAPS headers
  t = t.replace(/([^A-Z\n])\s+([A-Z]{4,})\b/g, (match, before, word) =>
    SECTION_WORDS.has(word) ? before + '\n\n' + word : match
  )

  // 4b. When a known section word is fused with following content on the same line
  //     e.g. "SUMMARY SENIOR DEVOPS & SRE, 02/2025" → "SUMMARY\nSENIOR DEVOPS & SRE, 02/2025"
  t = t.replace(/^([A-Z]{4,})\s+([A-Z].+)$/gm, (match, sectionWord, rest) =>
    SECTION_WORDS.has(sectionWord) ? sectionWord + '\n' + rest : match
  )

  // 5. Move stranded ALL-CAPS headers from the end of a line to their own line.
  //    e.g. "...May 2015  EDUCATION & VOLUNTEERING" → two lines
  t = t.replace(
    /^(.+?)\s{2,}([A-Z]{3,}(?:\s+[A-Z&/()\-]{3,})*)$/gm,
    (match, before, header) => {
      const words = header.trim().split(/\s+/)
      const allCaps = words.every((w: string) => /^[A-Z&/()\-]{3,}$/.test(w))
      const hasKnown = words.some((w: string) => SECTION_WORDS.has(w))
      return hasKnown || (words.length >= 2 && allCaps)
        ? before.trimEnd() + '\n\n' + header
        : match
    }
  )

  return t
}

// ─── Block types ──────────────────────────────────────────────────────────────

type Block =
  | { type: 'name'; text: string }
  | { type: 'tagline'; parts: string[] }
  | { type: 'contact'; items: string[] }
  | { type: 'header'; text: string }
  | { type: 'role'; title: string; org: string; dates: string }
  | { type: 'bullet'; text: string }
  | { type: 'plain'; text: string }
  | { type: 'spacer' }

// ─── Regex patterns ───────────────────────────────────────────────────────────

const ALL_CAPS_LINE_RE = /^[A-Z][A-Z0-9\s&/()\-,:.]{2,}$/
const DATE_RE = /\b(\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|[Pp]resent|[Cc]urrent|[Nn]ow)/
const CONTACT_LABEL_RE = /^(Location|Phone|Mobile|Tel|Email|LinkedIn|Website|GitHub|Portfolio|Address):/i
const BULLET_RE = /^●\s*/
const PIPE_RE = /\s*\|\s*/

// ─── Parser ───────────────────────────────────────────────────────────────────

function parse(cvText: string): Block[] {
  const processed = preprocessCv(cvText)
  const rawLines = processed.split('\n')
  const blocks: Block[] = []

  // Track whether we've passed the first section header (preamble = name/contact)
  let pastPreamble = false
  let preambleLines: string[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()
    if (!trimmed) {
      if (pastPreamble) blocks.push({ type: 'spacer' })
      continue
    }

    // -- Bullet
    if (BULLET_RE.test(trimmed)) {
      pastPreamble = true
      blocks.push({ type: 'bullet', text: trimmed.replace(BULLET_RE, '').trim() })
      continue
    }

    // -- ALL-CAPS header line
    if (ALL_CAPS_LINE_RE.test(trimmed) && trimmed.length <= 80) {
      if (!pastPreamble) {
        // Flush preamble before first header
        flushPreamble(preambleLines, blocks)
        preambleLines = []
        pastPreamble = true
      }
      blocks.push({ type: 'header', text: trimmed })
      continue
    }

    // -- Contact label line
    if (CONTACT_LABEL_RE.test(trimmed)) {
      preambleLines.push(trimmed)
      continue
    }

    // -- Role entry with embedded date range
    const dateMatch = DATE_RE.exec(trimmed)
    if (dateMatch && pastPreamble) {
      const dateStr = dateMatch[0].trim()
      const beforeDate = trimmed.slice(0, dateMatch.index).trim()
      const parts = beforeDate ? beforeDate.split(PIPE_RE) : []
      const title = parts[0]?.trim() ?? beforeDate
      const org = parts.slice(1).join(' · ').trim()
      blocks.push({ type: 'role', title, org, dates: dateStr })
      continue
    }

    // -- Preamble (before first header)
    if (!pastPreamble) {
      preambleLines.push(trimmed)
      continue
    }

    // -- Plain text
    blocks.push({ type: 'plain', text: trimmed })
  }

  // Flush any remaining preamble if no header was found
  if (preambleLines.length > 0) {
    flushPreamble(preambleLines, blocks)
  }

  // Collapse consecutive spacers; remove leading/trailing spacers
  return collapseSpacers(blocks)
}

// Split preamble lines into name, tagline, and contact blocks
function flushPreamble(lines: string[], blocks: Block[]) {
  if (lines.length === 0) return

  const contactLines: string[] = []
  const contentLines: string[] = []

  for (const line of lines) {
    if (CONTACT_LABEL_RE.test(line) || /^[\w.+\-]+@[\w.-]+\.\w+$/.test(line)) {
      contactLines.push(line)
    } else {
      contentLines.push(line)
    }
  }

  // First content line is name (possibly with tagline after a pipe or on a following line)
  if (contentLines.length > 0) {
    const firstLine = contentLines[0]
    if (PIPE_RE.test(firstLine)) {
      const parts = firstLine.split(PIPE_RE)
      blocks.push({ type: 'name', text: parts[0].trim() })
      if (parts.length > 1) {
        blocks.push({ type: 'tagline', parts: parts.slice(1).map((p) => p.trim()) })
      }
    } else {
      // Case 1: ALL-CAPS name (e.g. "NAHEEM QURESHI Senior DevOps, Platform Engineer & SRE")
      const allCapsName = firstLine.match(/^([A-Z][A-Z\s\-]{2,}[A-Z])\s+([A-Z][a-z].*)$/)
      if (allCapsName) {
        blocks.push({ type: 'name', text: allCapsName[1].trim() })
        blocks.push({ type: 'tagline', parts: [allCapsName[2].trim()] })
      } else {
        // Case 2: Title-case name followed by title/tagline
        // e.g. "Olaf Krasicki-Freund Cloud Architect | DevOps Manager"
        const nameMatch = firstLine.match(/^([A-Z][a-z]+(?:[\s-][A-Z][a-z\-]+){1,3})\s+(.+)$/)
        if (nameMatch && nameMatch[2]) {
          blocks.push({ type: 'name', text: nameMatch[1] })
          const rest = nameMatch[2]
          blocks.push({ type: 'tagline', parts: PIPE_RE.test(rest) ? rest.split(PIPE_RE).map((p) => p.trim()) : [rest] })
        } else {
          blocks.push({ type: 'name', text: firstLine })
        }
      }
    }

    // Remaining content lines as tagline
    for (const line of contentLines.slice(1)) {
      if (PIPE_RE.test(line)) {
        blocks.push({ type: 'tagline', parts: line.split(PIPE_RE).map((p) => p.trim()) })
      } else {
        blocks.push({ type: 'tagline', parts: [line] })
      }
    }
  }

  if (contactLines.length > 0) {
    blocks.push({ type: 'contact', items: contactLines })
  }
}

function collapseSpacers(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    if (b.type === 'spacer') {
      const prev = out[out.length - 1]
      if (!prev || prev.type === 'spacer' || prev.type === 'header') continue
    }
    out.push(b)
  }
  // Remove trailing spacer
  while (out[out.length - 1]?.type === 'spacer') out.pop()
  return out
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function NameBlock({ text }: { text: string }) {
  return (
    <p className="text-lg font-bold text-[var(--color-fg)] leading-tight">{text}</p>
  )
}

function TaglineBlock({ parts }: { parts: string[] }) {
  return (
    <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-2 text-[var(--color-fg-subtle)]">·</span>}
          {p}
        </span>
      ))}
    </p>
  )
}

function ContactBlock({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 mb-1">
      {items.map((item, i) => {
        const colonIdx = item.indexOf(':')
        if (colonIdx > -1) {
          const label = item.slice(0, colonIdx).trim()
          const value = item.slice(colonIdx + 1).trim()
          return (
            <span key={i} className="text-xs text-[var(--color-fg-subtle)]">
              <span className="text-[var(--color-fg-subtle)] font-medium">{label}:</span>{' '}
              <span className="text-[var(--color-fg-muted)]">{value}</span>
            </span>
          )
        }
        return <span key={i} className="text-xs text-[var(--color-fg-subtle)]">{item}</span>
      })}
    </div>
  )
}

function HeaderBlock({ text }: { text: string }) {
  return (
    <div className="mt-5 mb-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-400 border-b border-[var(--color-bg-input)] pb-1.5">
        {text}
      </h3>
    </div>
  )
}

function RoleBlock({ title, org, dates }: { title: string; org: string; dates: string }) {
  return (
    <div className="mt-2.5 mb-0.5 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-[var(--color-fg)]">{title}</span>
        {org && (
          <span className="text-sm text-[var(--color-fg-subtle)] font-normal"> · {org}</span>
        )}
      </div>
      {dates && (
        <span className="text-xs text-[var(--color-fg-subtle)] whitespace-nowrap shrink-0 mt-0.5 font-mono">
          {dates}
        </span>
      )}
    </div>
  )
}

function BulletBlock({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 items-start mt-1">
      <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-violet-500/70" />
      <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed flex-1">{text}</p>
    </div>
  )
}

function PlainBlock({ text }: { text: string }) {
  // Detect pipe-separated lines (e.g. skill categories)
  if (/\s*\|\s*/.test(text) && text.split(/\s*\|\s*/).length >= 2) {
    const parts = text.split(/\s*\|\s*/)
    return (
      <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2 text-[var(--color-border)]">|</span>}
            {p}
          </span>
        ))}
      </p>
    )
  }
  return <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed mt-0.5">{text}</p>
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CvDisplay({ cvText }: { cvText: string }) {
  const [expanded, setExpanded] = useState(false)

  if (!cvText?.trim()) {
    return <p className="text-sm text-[var(--color-fg-subtle)] italic">No CV text available.</p>
  }

  const blocks = parse(cvText)

  return (
    <div className="relative">
      <div className={expanded ? 'overflow-visible' : 'max-h-[600px] overflow-hidden'}>
        <div>
          {blocks.map((block, i) => {
            switch (block.type) {
              case 'name':    return <NameBlock    key={i} text={block.text} />
              case 'tagline': return <TaglineBlock key={i} parts={block.parts} />
              case 'contact': return <ContactBlock key={i} items={block.items} />
              case 'header':  return <HeaderBlock  key={i} text={block.text} />
              case 'role':    return <RoleBlock    key={i} title={block.title} org={block.org} dates={block.dates} />
              case 'bullet':  return <BulletBlock  key={i} text={block.text} />
              case 'plain':   return <PlainBlock   key={i} text={block.text} />
              case 'spacer':  return <div key={i} className="h-1.5" />
              default:        return null
            }
          })}
        </div>
      </div>

      {!expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--color-bg-elevated)] to-transparent pointer-events-none" />
      )}

      <div className={expanded ? 'mt-4' : 'relative mt-2 flex justify-center'}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400
                     hover:text-violet-300 transition-colors focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-violet-500 rounded px-2 py-1"
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" />Show less</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" />Show full CV</>
          )}
        </button>
      </div>
    </div>
  )
}
