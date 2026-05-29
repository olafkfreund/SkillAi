---
title: ai_usage
description: Schema reference for the ai_usage table.
sidebar:
  label: ai_usage
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/ai-usage.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `user_id` | `uuid` | — | — | — |
| `operation` | `varchar(64)` | `NOT NULL` | — | — |
| `model` | `varchar(100)` | `NOT NULL` | — | — |
| `input_tokens` | `integer` | `NOT NULL` | — | — |
| `output_tokens` | `integer` | `NOT NULL` | — | — |
| `cache_creation_tokens` | `integer` | — | — | — |
| `cache_read_tokens` | `integer` | — | — | — |
| `cost_usd` | `decimal` | `NOT NULL` | — | — |
| `duration_ms` | `integer` | — | — | — |
| `metadata` | `jsonb` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `aiUsage` (imported as `import { aiUsage } from '@/db/schema'`).
