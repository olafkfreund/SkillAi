# calendar_connections

_Schema reference for the calendar_connections table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/calendar-connections.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `user_id` | `uuid` | `NOT NULL` | — | `users.id` |
| `provider` | `varchar(20)` | `NOT NULL` | — | — |
| `access_token` | `text` | `NOT NULL` | — | — |
| `refresh_token` | `text` | — | — | — |
| `token_expiry` | `timestamp` | — | — | — |
| `calendar_id` | `varchar(500)` | — | `'primary'` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `calendarConnections` (imported as `import { calendarConnections } from '@/db/schema'`).
