/**
 * Smoke test for the Synechron CV PDF renderer.
 *
 * Verifies the component renders to a valid PDF buffer for both an
 * empty-state CV and a fully-populated CV. Asserts only on PDF magic
 * bytes + minimum size — not internal layout — so the renderer can be
 * restyled without breaking these tests.
 */

import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { SynechronCvPDF } from '@/lib/pdf'
import type { SynechronCvData } from '@/lib/ai/synechron-schema'

describe('SynechronCvPDF', () => {
  it('renders an empty CV (all fields blank) without throwing', async () => {
    const data: SynechronCvData = {}
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(SynechronCvPDF, { data }) as any
    )
    expect(buffer.length).toBeGreaterThan(1000) // valid PDFs are at least a few KB
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF') // PDF magic header
  })

  it('renders a fully-populated CV', async () => {
    const data: SynechronCvData = {
      candidateName: 'Jane Doe',
      jobTitle: 'Senior Engineer',
      overallExperience: '12+ years',
      synopsisBullets: ['Tech lead', 'Mentor'],
      employmentHistory: [
        {
          company: 'Acme',
          role: 'Senior Engineer',
          dates: '2020 – Present',
          responsibilities: ['Code review', 'Architecture'],
          skills: ['Go', 'TypeScript'],
        },
      ],
    }
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(SynechronCvPDF, { data, synechronCandidateId: 'SYNE-1234' }) as any
    )
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
