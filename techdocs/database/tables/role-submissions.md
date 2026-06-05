# role_submissions

_Schema reference for the role_submissions table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/role-submissions.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `sent_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `sent_by_user_id` | `uuid` | — | — | `users.id` |
| `status` | `submissionStatusEnum` | `NOT NULL` | `'submitted'` | — |
| `status_updated_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `notes` | `text` | — | — | — |
| `share_token` | `varchar(64)` | — | — | — |
| `share_token_created_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `roleSubmissions` (imported as `import { roleSubmissions } from '@/db/schema'`).
