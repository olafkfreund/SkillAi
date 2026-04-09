import {
  pgTable,
  pgPolicy,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'
import { users } from './users'

export const interviewSlots = pgTable(
  'interview_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
    interviewerId: uuid('interviewer_id').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 300 }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    location: varchar('location', { length: 500 }),
    meetingUrl: varchar('meeting_url', { length: 1000 }),
    status: varchar('status', { length: 30 }).notNull().default('scheduled'),
    slotNotes: text('slot_notes'),
    googleEventId: varchar('google_event_id', { length: 500 }),
    microsoftEventId: varchar('microsoft_event_id', { length: 500 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_interview_slots_candidate').on(t.candidateId),
    index('idx_interview_slots_tenant').on(t.tenantId),
    pgPolicy('interview_slots_tenant', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type InterviewSlot = typeof interviewSlots.$inferSelect
export type NewInterviewSlot = typeof interviewSlots.$inferInsert
