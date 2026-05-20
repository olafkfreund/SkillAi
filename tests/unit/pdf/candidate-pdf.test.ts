/**
 * Audience-gating regression tests for CandidatePDF.
 *
 * Strategy:
 *   - Render the PDF with a candidate that has ALL compliance fields set
 *   - For audience='customer': assert none of the compliance field text
 *     appears in the extracted PDF text
 *   - For audience='internal': assert the section heading appears
 *
 * PDF text extraction uses @react-pdf/renderer renderToBuffer +
 * pdf-parse, matching the pattern in synechron-cv-pdf.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { CandidatePDF } from '@/lib/pdf'

// ---------------------------------------------------------------------------
// Minimal candidate fixture with all compliance fields populated
// ---------------------------------------------------------------------------

const baseCandidate = {
  id: 'cand-001',
  tenantId: 'tenant-001',
  agencyId: null,
  firstName: 'Alice',
  lastName: 'Tester',
  email: 'alice@example.com',
  phone: null,
  cvText: 'Experienced software engineer with 10 years of experience.',
  cvTextFormatted: null,
  filePath: null,
  fileType: 'pdf' as const,
  linkedinUrl: null,
  githubUsername: null,
  embedding: null,
  status: 'new' as const,
  statusConfirmedBy: null,
  statusConfirmedAt: null,
  country: 'UK',
  city: 'London',
  languagesSpoken: ['English'],
  willingToRelocate: false,
  candidateRate: null,
  customerRate: null,
  rateCurrency: null,
  availabilityStatus: 'available' as const,
  availableFrom: null,
  isActive: true,
  synechronCvData: null,
  synechronCandidateId: null,
  createdAt: new Date('2025-01-01'),
  // Compliance fields — all populated so we can verify audience gating
  rightToWorkStatus: 'checked' as const,
  rightToWorkDocumentType: 'passport_uk' as const,
  rightToWorkExpiry: '2030-06-30',
  rightToWorkCheckedAt: new Date('2025-03-15T10:00:00Z'),
  rightToWorkCheckedBy: null,
  shareCode: 'ABC-DEF-GHI',
  sponsorshipRequired: false,
  nationality: 'British',
  noticePeriodDays: 30,
  gdprProcessingConsentAt: new Date('2025-01-02T09:00:00Z'),
  gdprProcessingConsentBy: 'candidate' as const,
}

const commonProps = {
  candidate: baseCandidate,
  agencyName: null,
  activeScore: null,
  activeRole: null,
  roleHistory: [],
  transcriptAnalyses: [],
  notes: [],
  enrichment: null,
  generatedAt: new Date('2025-05-01'),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract raw text from a PDF buffer using pdf-parse v2 (class-based API). */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  // TextResult.pages is an array of PageTextResult; join all page text
  return result.pages.map((p) => p.text).join('\n')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CandidatePDF — compliance section audience gating', () => {
  it('customer PDF renders without throwing and produces a valid PDF buffer', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'customer' }) as any
    )
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('internal PDF renders without throwing and produces a valid PDF buffer', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'internal' }) as any
    )
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('customer PDF does NOT contain any compliance field text', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'customer' }) as any
    )
    const text = await extractPdfText(buffer)
    const lower = text.toLowerCase()

    // None of the compliance-section strings should appear
    expect(lower).not.toContain('right to work')
    expect(lower).not.toContain('share code')
    expect(lower).not.toContain('sponsorship required')
    expect(lower).not.toContain('nationality')
    expect(lower).not.toContain('notice period')
    expect(lower).not.toContain('gdpr consent')
    expect(lower).not.toContain('compliance')
    // The specific values should also be absent
    expect(lower).not.toContain('abc-def-ghi')
    expect(lower).not.toContain('british')
    expect(lower).not.toContain('passport_uk')
  })

  it('internal PDF contains the Compliance & Eligibility section heading', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'internal' }) as any
    )
    const text = await extractPdfText(buffer)
    const lower = text.toLowerCase()

    expect(lower).toContain('compliance')
  })

  it('internal PDF contains the right to work status', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'internal' }) as any
    )
    const text = await extractPdfText(buffer)
    const lower = text.toLowerCase()

    // "Right to Work Status" label and "Checked" value
    expect(lower).toContain('right to work')
    expect(lower).toContain('checked')
  })

  it('internal PDF contains nationality and notice period', async () => {
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CandidatePDF, { ...commonProps, audience: 'internal' }) as any
    )
    const text = await extractPdfText(buffer)
    const lower = text.toLowerCase()

    expect(lower).toContain('british')
    expect(lower).toContain('30 day')
  })

  it('compliance section is absent when no compliance fields are set', async () => {
    const candidateNoCompliance = {
      ...baseCandidate,
      rightToWorkStatus: null,
      rightToWorkDocumentType: null,
      rightToWorkExpiry: null,
      rightToWorkCheckedAt: null,
      shareCode: null,
      sponsorshipRequired: false,
      nationality: null,
      noticePeriodDays: null,
      gdprProcessingConsentAt: null,
      gdprProcessingConsentBy: null,
    }

    const buffer = await renderToBuffer(
      React.createElement(CandidatePDF, {
        ...commonProps,
        candidate: candidateNoCompliance,
        audience: 'internal',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    )
    const text = await extractPdfText(buffer)
    const lower = text.toLowerCase()

    // Section should not appear at all when no data
    expect(lower).not.toContain('compliance & eligibility')
  })
})
