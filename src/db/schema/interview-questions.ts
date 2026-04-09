import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  integer,
  text,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { interviewPacks } from './interview-packs'

export const questionTypeEnum = pgEnum('question_type', [
  'behavioral',
  'technical',
  'situational',
  'cultural',
])

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])

export const interviewQuestions = pgTable(
  'interview_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => interviewPacks.id, { onDelete: 'cascade' }),
    questionType: questionTypeEnum('question_type').notNull(),
    difficulty: difficultyEnum('difficulty').notNull(),
    questionText: text('question_text').notNull(),
    rationale: text('rationale'),
    // JSONB: array of { question: string } follow-up objects
    followUps: jsonb('follow_ups').$type<Array<{ question: string }>>(),
    // TEXT[] signals — stored as postgres arrays
    strongAnswerSignals: text('strong_answer_signals').array(),
    acceptableAnswerSignals: text('acceptable_answer_signals').array(),
    weakAnswerSignals: text('weak_answer_signals').array(),
    // References to specific CV moments that inspired this question
    cvReferences: text('cv_references').array(),
    orderIndex: integer('order_index').notNull().default(0),
    // Interviewer notes (filled in post-interview)
    notes: text('notes'),
  },
  (t) => [
    index('idx_interview_questions_pack').on(t.packId),
    // RLS via pack_id → interview_packs (which has tenant isolation)
    // Direct RLS policy using a subquery to check tenant ownership
    pgPolicy('interview_questions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM interview_packs ip
        WHERE ip.id = ${t.packId}
          AND ip.tenant_id = current_setting('app.tenant_id', true)::uuid
      )`,
    }),
  ]
).enableRLS()

export type InterviewQuestion = typeof interviewQuestions.$inferSelect
export type NewInterviewQuestion = typeof interviewQuestions.$inferInsert
