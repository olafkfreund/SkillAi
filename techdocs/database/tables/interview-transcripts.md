# interview_transcripts

_Schema reference for the interview_transcripts table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/interview-transcripts.ts`. **14** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `pack_id` | `uuid` | — | — | `interviewPacks.id` |
| `raw_transcript_text` | `text` | `NOT NULL` | — | — |
| `parsed_transcript` | `jsonb` | — | — | — |
| `source_platform` | `transcriptPlatformEnum` | `NOT NULL` | `'other'` | — |
| `source_format` | `transcriptFormatEnum` | `NOT NULL` | — | — |
| `interview_date` | `timestamp` | — | — | — |
| `analysis_status` | `transcriptAnalysisStatusEnum` | `NOT NULL` | `'pending'` | — |
| `error_message` | `text` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `interviewTranscripts` (imported as `import { interviewTranscripts } from '@/db/schema'`).
