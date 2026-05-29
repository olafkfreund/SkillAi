---
title: customers
description: Schema reference for the customers table.
sidebar:
  label: customers
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/customers.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `name` | `varchar(200)` | `NOT NULL` | — | — |
| `contact_name` | `varchar(100)` | — | — | — |
| `contact_email` | `varchar(255)` | — | — | — |
| `contact_phone` | `varchar(50)` | — | — | — |
| `website` | `varchar(500)` | — | — | — |
| `portal_base_url` | `varchar(500)` | — | — | — |
| `logo_path` | `varchar(500)` | — | — | — |
| `role_id_label` | `varchar(60)` | — | — | — |
| `notes` | `text` | — | — | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `customers` (imported as `import { customers } from '@/db/schema'`).
