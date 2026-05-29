---
title: role_submissions
description: Schema reference for the role_submissions table.
sidebar:
  label: role_submissions
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/role-submissions.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

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
