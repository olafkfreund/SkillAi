# tenants

_Schema reference for the tenants table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/tenants.ts`. **5** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `name` | `varchar(100)` | `NOT NULL` | — | — |
| `slug` | `varchar(100)` | `NOT NULL` `UNIQUE` | — | — |
| `plan` | `varchar(20)` | `NOT NULL` | `'free'` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `tenants` (imported as `import { tenants } from '@/db/schema'`).
