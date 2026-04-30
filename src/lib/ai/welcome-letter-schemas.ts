/**
 * Zod schema for the AI-personalised welcome letter PDF.
 *
 * This file is the load-bearing contract between the AI generator
 * (src/lib/ai/welcome-letter.ts) and the PDF renderer
 * (src/lib/pdf/welcome-letter-pdf.tsx). Both import WelcomeLetter
 * from here.
 */

import { z } from 'zod'

export const WelcomeLetterSchema = z.object({
  greeting: z.string(),
  intro: z.string(),
  interviewProcess: z.object({
    title: z.string(),
    sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(2).max(4),
  }),
  karatSection: z.object({
    title: z.string(),
    whatItIs: z.string(),
    whatToExpect: z.string(),
    link: z.string().url(),
  }).nullable(),
  starFormat: z.object({
    title: z.string(),
    description: z.string(),
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
    workedExample: z.string(),
  }),
  tipsAndTricks: z.array(z.object({ heading: z.string(), body: z.string() })).min(4).max(6),
  gapsToBridge: z.array(z.object({ area: z.string(), suggestion: z.string() })).max(5),
  motivation: z.string(),
  signoff: z.string(),
})

export type WelcomeLetter = z.infer<typeof WelcomeLetterSchema>

export const INTERVIEW_TYPES = ['standard', 'karat', 'both'] as const
export type InterviewType = (typeof INTERVIEW_TYPES)[number]
