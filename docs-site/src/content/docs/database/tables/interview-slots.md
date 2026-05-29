---
title: interview_slots
description: Schema reference for the interview_slots table.
sidebar:
  label: interview_slots
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/interview-slots.ts`. **17** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `role_id` | `uuid` | — | — | `roles.id` |
| `interviewer_id` | `uuid` | — | — | `users.id` |
| `title` | `varchar(300)` | `NOT NULL` | — | — |
| `scheduled_at` | `timestamp` | `NOT NULL` | — | — |
| `duration_minutes` | `integer` | `NOT NULL` | `60` | — |
| `location` | `varchar(500)` | — | — | — |
| `meeting_url` | `varchar(1000)` | — | — | — |
| `status` | `varchar(30)` | `NOT NULL` | `'scheduled'` | — |
| `slot_notes` | `text` | — | — | — |
| `google_event_id` | `varchar(500)` | — | — | — |
| `microsoft_event_id` | `varchar(500)` | — | — | — |
| `created_by` | `uuid` | `NOT NULL` | — | `users.id` |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `interviewSlots` (imported as `import { interviewSlots } from '@/db/schema'`).
