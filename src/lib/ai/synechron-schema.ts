/**
 * Zod schema for AI-extracted Synechron-format CV data.
 *
 * Every field is optional — the extraction prompt instructs the model to leave
 * fields blank rather than guess when the source CV does not provide the data.
 */

import { z } from 'zod'

export const SynechronCvDataSchema = z.object({
  candidateName: z.string().optional(),
  jobTitle: z.string().optional(),
  overallExperience: z.string().optional(),
  relevantExperience: z.string().optional(),
  skillsCategorised: z
    .array(
      z.object({
        category: z.string(),
        skills: z.array(z.string()),
      })
    )
    .optional(),
  domains: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string().optional(),
      })
    )
    .optional(),
  visa: z.string().optional(),
  trainingCertifications: z.array(z.string()).optional(),
  synopsisBullets: z.array(z.string()).optional(),
  employmentHistory: z
    .array(
      z.object({
        company: z.string().optional(),
        role: z.string().optional(),
        dates: z.string().optional(),
        teamSize: z.string().optional(),
        client: z.string().optional(),
        duration: z.string().optional(),
        description: z.string().optional(),
        responsibilities: z.array(z.string()).optional(),
        skills: z.array(z.string()).optional(),
      })
    )
    .optional(),
})

export type SynechronCvData = z.infer<typeof SynechronCvDataSchema>
