import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { users } from './users'

// No RLS on this table — calendar connections are per-user, not per-tenant.
// Queries use direct db (not withTenant) with explicit userId filter.
export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'google' | 'microsoft'
    provider: varchar('provider', { length: 20 }).notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
    calendarId: varchar('calendar_id', { length: 500 }).default('primary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('calendar_connections_user_provider').on(t.userId, t.provider)]
)

export type CalendarConnection = typeof calendarConnections.$inferSelect
export type NewCalendarConnection = typeof calendarConnections.$inferInsert
