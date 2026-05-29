---
title: roles
description: Schema reference for the roles table.
sidebar:
  label: roles
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/roles.ts`. **27** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `title` | `varchar(200)` | `NOT NULL` | — | — |
| `description` | `text` | `NOT NULL` | — | — |
| `requirements` | `text` | `NOT NULL` | — | — |
| `file_path` | `varchar(500)` | — | — | — |
| `created_by` | `uuid` | `NOT NULL` | — | `users.id` |
| `customer_id` | `uuid` | — | — | `customers.id` |
| `customer_role_id` | `varchar(100)` | — | — | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `framework_level_id` | `varchar(50)` | — | — | — |
| `framework_level_label` | `varchar(200)` | — | — | — |
| `country` | `varchar(100)` | — | — | — |
| `city` | `varchar(100)` | — | — | — |
| `work_mode` | `workModeEnum` | — | — | — |
| `language_requirements` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `key_skills` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `top_requirements` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `priority_keywords` | `text` | `NOT NULL` | `sql`'{}'::text[]`` | — |
| `priority_keywords_updated_at` | `timestamp` | — | — | — |
| `target_fill_date` | `date` | — | — | — |
| `cutoff_date` | `date` | — | — | — |
| `customer_portal_path` | `varchar(500)` | — | — | — |
| `customer_day_rate` | `numeric` | — | — | — |
| `rate_currency` | `varchar(3)` | — | — | — |
| `shortlist_sent_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `roles` (imported as `import { roles } from '@/db/schema'`).
