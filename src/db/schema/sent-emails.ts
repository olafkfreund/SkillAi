import { pgTable, pgPolicy, uuid, varchar, text, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { emailTemplates } from './email-templates'
import { users } from './users'

export const SEND_STATUSES = ['sent', 'failed'] as const
export type SendStatus = (typeof SEND_STATUSES)[number]

/**
 * Immutable audit log of every email dispatched to a candidate.
 * A row is inserted regardless of send success/failure — the send_status
 * and error_message columns capture the outcome. template_id is nullable
 * because templates can be deleted after the email was sent.
 */
export const sentEmails = pgTable(
  'sent_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => emailTemplates.id, { onDelete: 'set null' }),
    templateName: varchar('template_name', { length: 80 }).notNull(),
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    recipientName: varchar('recipient_name', { length: 200 }),
    senderUserId: uuid('sender_user_id').references(() => users.id),
    senderEmail: varchar('sender_email', { length: 255 }).notNull(),
    senderName: varchar('sender_name', { length: 200 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    body: text('body').notNull(),
    sendStatus: varchar('send_status', { length: 20 }).notNull().default('sent'),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_sent_emails_candidate').on(t.candidateId, t.sentAt),
    index('idx_sent_emails_tenant').on(t.tenantId, t.sentAt),
    check('sent_emails_status_check', sql`${t.sendStatus} IN ('sent', 'failed')`),
    pgPolicy('sent_emails_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type SentEmail = typeof sentEmails.$inferSelect
export type NewSentEmail = typeof sentEmails.$inferInsert
