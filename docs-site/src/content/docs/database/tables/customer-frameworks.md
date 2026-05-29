---
title: customer_frameworks
description: Schema reference for the customer_frameworks table.
sidebar:
  label: customer_frameworks
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/customer-frameworks.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `customer_id` | `uuid` | `NOT NULL` | — | `customers.id` |
| `name` | `varchar(200)` | `NOT NULL` | — | — |
| `description` | `text` | — | — | — |
| `levels` | `jsonb` | `NOT NULL` | `[]` | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `customerFrameworks` (imported as `import { customerFrameworks } from '@/db/schema'`).
