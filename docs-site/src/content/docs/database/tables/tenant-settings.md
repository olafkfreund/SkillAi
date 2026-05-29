---
title: tenant_settings
description: Schema reference for the tenant_settings table.
sidebar:
  label: tenant_settings
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/tenant-settings.ts`. **6** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `key` | `varchar(100)` | `NOT NULL` | — | — |
| `value` | `text` | `NOT NULL` | — | — |
| `updated_by` | `uuid` | `NOT NULL` | — | `users.id` |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `tenantSettings` (imported as `import { tenantSettings } from '@/db/schema'`).
