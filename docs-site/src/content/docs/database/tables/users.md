---
title: users
description: Schema reference for the users table.
sidebar:
  label: users
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/users.ts`. **12** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `email` | `varchar(255)` | `NOT NULL` | — | — |
| `name` | `varchar(100)` | `NOT NULL` | — | — |
| `role` | `userRoleEnum` | `NOT NULL` | `'recruiter'` | — |
| `password_hash` | `varchar(255)` | `NOT NULL` | — | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `password_reset_required` | `boolean` | `NOT NULL` | `false` | — |
| `last_password_change_at` | `timestamp` | — | — | — |
| `password_reset_token_hash` | `varchar(64)` | — | — | — |
| `password_reset_token_expires_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `users` (imported as `import { users } from '@/db/schema'`).
