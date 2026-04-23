# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2026-04-10-interview-transcript-scoring/spec.md

> Created: 2026-04-10
> Version: 1.0.0

## New Tables

### `interview_transcripts`

Stores uploaded transcript files and their parsed content.

```typescript
// src/db/schema/interview-transcripts.ts
import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'
import { interviewPacks } from './interview-packs'

export const transcriptPlatformEnum = pgEnum('transcript_platform', [
  'teams', 'zoom', 'meet', 'other'
])

export const transcriptFormatEnum = pgEnum('transcript_format', [
  'vtt', 'srt', 'docx', 'txt', 'pdf', 'paste'
])

export const transcriptAnalysisStatusEnum = pgEnum('transcript_analysis_status', [
  'pending', 'analyzing', 'complete', 'failed'
])

export const interviewTranscripts = pgTable('interview_transcripts', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  tenantId:           uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  candidateId:        uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  roleId:             uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  packId:             uuid('pack_id').references(() => interviewPacks.id, { onDelete: 'set null' }),
  rawTranscriptText:  text('raw_transcript_text').notNull(),
  parsedTranscript:   jsonb('parsed_transcript').$type<TranscriptCue[]>(),
  sourcePlatform:     transcriptPlatformEnum('source_platform').notNull().default('other'),
  sourceFormat:       transcriptFormatEnum('source_format').notNull(),
  interviewDate:      timestamp('interview_date', { withTimezone: true }),
  analysisStatus:     transcriptAnalysisStatusEnum('analysis_status').notNull().default('pending'),
  errorMessage:       text('error_message'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TranscriptCue = {
  speaker: string
  timestamp: number  // milliseconds from start
  text: string
}

export type InterviewTranscript = typeof interviewTranscripts.$inferSelect
export type NewInterviewTranscript = typeof interviewTranscripts.$inferInsert
```

**Indexes:**
```sql
CREATE INDEX idx_interview_transcripts_tenant ON interview_transcripts (tenant_id);
CREATE INDEX idx_interview_transcripts_candidate ON interview_transcripts (candidate_id);
CREATE INDEX idx_interview_transcripts_pack ON interview_transcripts (pack_id);
```

**RLS Policy:**
```sql
ALTER TABLE interview_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_transcripts_tenant_isolation
  ON interview_transcripts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### `transcript_analyses`

Stores the AI-generated analysis output for a transcript.

```typescript
// src/db/schema/transcript-analyses.ts
import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { interviewTranscripts } from './interview-transcripts'

export const recommendedDecisionEnum = pgEnum('recommended_decision', [
  'proceed', 'consider', 'decline'
])

export const interviewQuestionQualityEnum = pgEnum('interview_question_quality', [
  'strong', 'acceptable', 'weak'
])

export const transcriptAnalyses = pgTable('transcript_analyses', {
  id:                         uuid('id').primaryKey().defaultRandom(),
  tenantId:                   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  transcriptId:               uuid('transcript_id').notNull().unique().references(() => interviewTranscripts.id, { onDelete: 'cascade' }),

  // Overall
  overallScore:               integer('overall_score'),

  // Dimension scores (0-100)
  communicationScore:         integer('communication_score'),
  technicalDepthScore:        integer('technical_depth_score'),
  problemSolvingScore:        integer('problem_solving_score'),
  socialFitScore:             integer('social_fit_score'),

  // Reasoning text
  communicationReasoning:     text('communication_reasoning'),
  technicalDepthReasoning:    text('technical_depth_reasoning'),
  problemSolvingReasoning:    text('problem_solving_reasoning'),
  socialFitReasoning:         text('social_fit_reasoning'),

  // AI output
  summary:                    text('summary'),
  strengths:                  text('strengths').array(),
  redFlags:                   text('red_flags').array(),
  recommendedDecision:        recommendedDecisionEnum('recommended_decision'),

  // Per-question breakdown (optional, only when pack linked)
  questionResponses:          jsonb('question_responses').$type<QuestionResponse[]>(),

  createdAt:                  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type QuestionResponse = {
  questionText: string
  transcriptExcerpt: string
  quality: 'strong' | 'acceptable' | 'weak'
  notes: string
}

export type TranscriptAnalysis = typeof transcriptAnalyses.$inferSelect
export type NewTranscriptAnalysis = typeof transcriptAnalyses.$inferInsert
```

**Indexes:**
```sql
CREATE INDEX idx_transcript_analyses_tenant ON transcript_analyses (tenant_id);
CREATE INDEX idx_transcript_analyses_transcript ON transcript_analyses (transcript_id);
```

**RLS Policy:**
```sql
ALTER TABLE transcript_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY transcript_analyses_tenant_isolation
  ON transcript_analyses
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

## Schema Index Update

```typescript
// src/db/schema/index.ts — add exports
export * from './interview-transcripts'
export * from './transcript-analyses'
```

---

## Drizzle Migration

After creating schema files, run:
```bash
# Development (push directly)
npx drizzle-kit push

# Production (generate migration file)
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## Rationale

- **`packId` is nullable** — most transcripts will not have a linked pack; when it is set, Claude maps answers to pack questions in `question_responses`
- **`parsedTranscript` JSONB** — structured cues stored alongside raw text; enables future UI display of timestamped conversation without re-parsing
- **`transcriptAnalyses` separate table** — mirrors the `scores` pattern (separate from `candidates`); allows re-running analysis without losing the original transcript record
- **`unique` on `transcriptId`** — one analysis per transcript; re-run by deleting and re-inserting (or update-in-place on retry)
- **`text().array()` for strengths/redFlags** — matches how `interviewQuestions.strongAnswerSignals` is stored; consistent with existing schema patterns
