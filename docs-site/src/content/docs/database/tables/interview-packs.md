---
title: interview_packs
description: Schema reference for the interview_packs table.
sidebar:
  label: interview_packs
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/interview-packs.ts`. **15** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `generation_status` | `generationStatusEnum` | `NOT NULL` | `'pending'` | — |
| `generation_stage` | `text` | — | — | — |
| `experience_level` | `experienceLevelEnum` | — | — | — |
| `recommended_duration_minutes` | `integer` | — | — | — |
| `includes_code_challenge` | `boolean` | `NOT NULL` | `false` | — |
| `pack_type` | `packTypeEnum` | `NOT NULL` | `'full'` | — |
| `language` | `varchar(10)` | `NOT NULL` | `'en'` | — |
| `error_message` | `text` | — | — | — |
| `created_by` | `uuid` | `NOT NULL` | — | `users.id` |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `interviewPacks` (imported as `import { interviewPacks } from '@/db/schema'`).
