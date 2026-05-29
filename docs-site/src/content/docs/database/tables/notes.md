---
title: notes
description: Schema reference for the notes table.
sidebar:
  label: notes
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/notes.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `author_id` | `uuid` | `NOT NULL` | — | `users.id` |
| `body` | `text` | `NOT NULL` | — | — |
| `is_shareable` | `boolean` | `NOT NULL` | `false` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | — | — | — |
| `is_edited` | `boolean` | `NOT NULL` | `false` | — |

**Drizzle name:** `notes` (imported as `import { notes } from '@/db/schema'`).
