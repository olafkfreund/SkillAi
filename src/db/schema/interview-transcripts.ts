import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'
import { interviewPacks } from './interview-packs'

export const transcriptPlatformEnum = pgEnum('transcript_platform', [
  'teams',
  'zoom',
  'meet',
  'other',
])

export const transcriptFormatEnum = pgEnum('transcript_format', [
  'vtt',
  'srt',
  'docx',
  'txt',
  'pdf',
  'paste',
])

export const transcriptAnalysisStatusEnum = pgEnum('transcript_analysis_status', [
  'pending',
  'analyzing',
  'complete',
  'failed',
])

export type TranscriptCue = {
  speaker: string
  timestamp: number // milliseconds from start of recording
  text: string
}

export const interviewTranscripts = pgTable(
  'interview_transcripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    packId: uuid('pack_id').references(() => interviewPacks.id, {
      onDelete: 'set null',
    }),
    rawTranscriptText: text('raw_transcript_text').notNull(),
    parsedTranscript: jsonb('parsed_transcript').$type<TranscriptCue[]>(),
    sourcePlatform: transcriptPlatformEnum('source_platform').notNull().default('other'),
    sourceFormat: transcriptFormatEnum('source_format').notNull(),
    interviewDate: timestamp('interview_date', { withTimezone: true }),
    analysisStatus: transcriptAnalysisStatusEnum('analysis_status')
      .notNull()
      .default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_interview_transcripts_tenant').on(t.tenantId),
    index('idx_interview_transcripts_candidate').on(t.candidateId),
    index('idx_interview_transcripts_pack').on(t.packId),
    pgPolicy('interview_transcripts_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type InterviewTranscript = typeof interviewTranscripts.$inferSelect
export type NewInterviewTranscript = typeof interviewTranscripts.$inferInsert
