# api_tokens

_Schema reference for the api_tokens table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/api-tokens.ts`. **11** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `user_id` | `uuid` | `NOT NULL` | — | `users.id` |
| `name` | `varchar(100)` | `NOT NULL` | — | — |
| `prefix` | `varchar(20)` | `NOT NULL` `UNIQUE` | — | — |
| `hash` | `varchar(500)` | `NOT NULL` | — | — |
| `scopes` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `expires_at` | `timestamp` | — | — | — |
| `last_used_at` | `timestamp` | — | — | — |
| `revoked_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `apiTokens` (imported as `import { apiTokens } from '@/db/schema'`).
