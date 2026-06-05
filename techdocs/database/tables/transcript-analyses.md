# transcript_analyses

_Schema reference for the transcript_analyses table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/transcript-analyses.ts`. **19** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `transcript_id` | `uuid` | `NOT NULL` | — | `interviewTranscripts.id` |
| `overall_score` | `integer` | — | — | — |
| `communication_score` | `integer` | — | — | — |
| `technical_depth_score` | `integer` | — | — | — |
| `problem_solving_score` | `integer` | — | — | — |
| `social_fit_score` | `integer` | — | — | — |
| `communication_reasoning` | `text` | — | — | — |
| `technical_depth_reasoning` | `text` | — | — | — |
| `problem_solving_reasoning` | `text` | — | — | — |
| `social_fit_reasoning` | `text` | — | — | — |
| `summary` | `text` | — | — | — |
| `strengths` | `text` | — | — | — |
| `red_flags` | `text` | — | — | — |
| `recommended_decision` | `recommendedDecisionEnum` | — | — | — |
| `question_responses` | `jsonb` | — | — | — |
| `detected_language` | `varchar(10)` | `NOT NULL` | `'en'` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `transcriptAnalyses` (imported as `import { transcriptAnalyses } from '@/db/schema'`).
