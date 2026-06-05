# candidate_enrichments

_Schema reference for the candidate_enrichments table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/candidate-enrichments.ts`. **11** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` `UNIQUE` | — | `candidates.id` |
| `web_hits` | `jsonb` | — | `[]` | — |
| `github_profile` | `jsonb` | — | — | — |
| `verified_profiles` | `jsonb` | `NOT NULL` | `sql`'[]'::jsonb`` | — |
| `rejected_urls` | `jsonb` | `NOT NULL` | `sql`'[]'::jsonb`` | — |
| `stack_overflow_profile` | `jsonb` | — | — | — |
| `devto_profile` | `jsonb` | — | — | — |
| `personal_site_summary` | `jsonb` | — | — | — |
| `searched_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `candidateEnrichments` (imported as `import { candidateEnrichments } from '@/db/schema'`).
