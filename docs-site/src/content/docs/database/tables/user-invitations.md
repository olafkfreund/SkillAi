---
title: user_invitations
description: Schema reference for the user_invitations table.
sidebar:
  label: user_invitations
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/user-invitations.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `token` | `varchar(64)` | `NOT NULL` `UNIQUE` | — | — |
| `email` | `varchar(255)` | — | — | — |
| `role` | `varchar(20)` | `NOT NULL` | `'recruiter'` | — |
| `created_by` | `uuid` | `NOT NULL` | — | — |
| `expires_at` | `timestamp` | `NOT NULL` | — | — |
| `used_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `userInvitations` (imported as `import { userInvitations } from '@/db/schema'`).
