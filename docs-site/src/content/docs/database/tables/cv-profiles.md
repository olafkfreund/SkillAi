---
title: cv_profiles
description: Schema reference for the cv_profiles table.
sidebar:
  label: cv_profiles
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/cv-profiles.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` `UNIQUE` | — | `candidates.id` |
| `experience_level` | `text` | — | — | — |
| `summary` | `text` | — | — | — |
| `technical_skills` | `jsonb` | — | `[]` | — |
| `companies` | `jsonb` | — | `[]` | — |
| `personalizable_moments` | `jsonb` | — | `[]` | — |
| `extraction_status` | `text` | `NOT NULL` | `'pending'` | — |
| `error_message` | `text` | — | — | — |
| `ai_model` | `text` | — | — | — |
| `extracted_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `cvProfiles` (imported as `import { cvProfiles } from '@/db/schema'`).
