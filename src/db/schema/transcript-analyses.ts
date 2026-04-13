import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { interviewTranscripts } from './interview-transcripts'

export const recommendedDecisionEnum = pgEnum('recommended_decision', [
  'proceed',
  'consider',
  'decline',
])

export type QuestionResponse = {
  questionText: string
  transcriptExcerpt: string
  quality: 'strong' | 'acceptable' | 'weak'
  notes: string
}

export const transcriptAnalyses = pgTable(
  'transcript_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    transcriptId: uuid('transcript_id')
      .notNull()
      .references(() => interviewTranscripts.id, { onDelete: 'cascade' }),

    // Scores (0-100)
    overallScore: integer('overall_score'),
    communicationScore: integer('communication_score'),
    technicalDepthScore: integer('technical_depth_score'),
    problemSolvingScore: integer('problem_solving_score'),
    socialFitScore: integer('social_fit_score'),

    // Reasoning
    communicationReasoning: text('communication_reasoning'),
    technicalDepthReasoning: text('technical_depth_reasoning'),
    problemSolvingReasoning: text('problem_solving_reasoning'),
    socialFitReasoning: text('social_fit_reasoning'),

    // AI output
    summary: text('summary'),
    strengths: text('strengths').array(),
    redFlags: text('red_flags').array(),
    recommendedDecision: recommendedDecisionEnum('recommended_decision'),

    // Per-question breakdown (populated when transcript is linked to a pack)
    questionResponses: jsonb('question_responses').$type<QuestionResponse[]>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('transcript_analyses_transcript_unique').on(t.transcriptId),
    index('idx_transcript_analyses_tenant').on(t.tenantId),
    index('idx_transcript_analyses_transcript').on(t.transcriptId),
    pgPolicy('transcript_analyses_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type TranscriptAnalysis = typeof transcriptAnalyses.$inferSelect
export type NewTranscriptAnalysis = typeof transcriptAnalyses.$inferInsert
