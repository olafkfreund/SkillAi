# candidates

_Schema reference for the candidates table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/candidates.ts`. **41** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `agency_id` | `uuid` | — | — | `agencies.id` |
| `first_name` | `varchar(100)` | `NOT NULL` | — | — |
| `last_name` | `varchar(100)` | `NOT NULL` | — | — |
| `email` | `varchar(255)` | — | — | — |
| `phone` | `varchar(50)` | — | — | — |
| `cv_text` | `text` | `NOT NULL` | — | — |
| `cv_text_formatted` | `text` | — | — | — |
| `file_path` | `varchar(500)` | — | — | — |
| `file_type` | `fileTypeEnum` | `NOT NULL` | — | — |
| `linkedin_url` | `varchar(500)` | — | — | — |
| `github_username` | `varchar(100)` | — | — | — |
| `embedding` | `text` | — | — | — |
| `status` | `candidateStatusEnum` | `NOT NULL` | `'new'` | — |
| `status_confirmed_by` | `uuid` | — | — | `users.id` |
| `status_confirmed_at` | `timestamp` | — | — | — |
| `country` | `varchar(100)` | — | — | — |
| `city` | `varchar(100)` | — | — | — |
| `languages_spoken` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `willing_to_relocate` | `boolean` | — | — | — |
| `candidate_rate` | `numeric` | — | — | — |
| `customer_rate` | `numeric` | — | — | — |
| `rate_currency` | `varchar(3)` | — | — | — |
| `availability_status` | `availabilityStatusEnum` | `NOT NULL` | `'available'` | — |
| `available_from` | `date` | — | — | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `synechron_cv_data` | `jsonb` | — | — | — |
| `synechron_candidate_id` | `varchar(64)` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `right_to_work_status` | `rightToWorkStatusEnum` | — | — | — |
| `right_to_work_document_type` | `rightToWorkDocumentTypeEnum` | — | — | — |
| `right_to_work_expiry` | `date` | — | — | — |
| `right_to_work_checked_at` | `timestamp` | — | — | — |
| `right_to_work_checked_by` | `uuid` | — | — | `users.id` |
| `share_code` | `varchar(20)` | — | — | — |
| `sponsorship_required` | `boolean` | `NOT NULL` | `false` | — |
| `nationality` | `varchar(100)` | — | — | — |
| `notice_period_days` | `integer` | — | — | — |
| `gdpr_processing_consent_at` | `timestamp` | — | — | — |
| `gdpr_processing_consent_by` | `gdprProcessingConsentByEnum` | — | — | — |

**Drizzle name:** `candidates` (imported as `import { candidates } from '@/db/schema'`).
