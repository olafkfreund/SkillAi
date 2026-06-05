# scores

_Schema reference for the scores table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/scores.ts`. **18** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `score_status` | `scoreStatusEnum` | `NOT NULL` | `'pending'` | — |
| `overall_score` | `integer` | — | — | — |
| `technical_score` | `integer` | — | — | — |
| `experience_score` | `integer` | — | — | — |
| `cultural_fit_score` | `integer` | — | — | — |
| `communication_score` | `integer` | — | — | — |
| `technical_reasoning` | `text` | — | — | — |
| `experience_reasoning` | `text` | — | — | — |
| `cultural_fit_reasoning` | `text` | — | — | — |
| `communication_reasoning` | `text` | — | — | — |
| `ai_summary` | `text` | — | — | — |
| `error_message` | `text` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `scores` (imported as `import { scores } from '@/db/schema'`).
