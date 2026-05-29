---
title: candidate_role_approvals
description: Schema reference for the candidate_role_approvals table.
sidebar:
  label: candidate_role_approvals
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/candidate-role-approvals.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `manager_id` | `uuid` | `NOT NULL` | — | `users.id` |
| `decision` | `varchar(20)` | `NOT NULL` | `'pending'` | — |
| `comment` | `text` | — | — | — |
| `decided_at` | `timestamp` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `candidateRoleApprovals` (imported as `import { candidateRoleApprovals } from '@/db/schema'`).
