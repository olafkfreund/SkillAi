---
title: sent_emails
description: Schema reference for the sent_emails table.
sidebar:
  label: sent_emails
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="note">
Auto-generated from `src/db/schema/sent-emails.ts`. **15** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.
</Aside>

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/SkillAi/architecture/multi-tenancy-rls).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `candidate_id` | `uuid` | `NOT NULL` | — | `candidates.id` |
| `template_id` | `uuid` | — | — | `emailTemplates.id` |
| `template_name` | `varchar(80)` | `NOT NULL` | — | — |
| `recipient_email` | `varchar(255)` | `NOT NULL` | — | — |
| `recipient_name` | `varchar(200)` | — | — | — |
| `sender_user_id` | `uuid` | — | — | `users.id` |
| `sender_email` | `varchar(255)` | `NOT NULL` | — | — |
| `sender_name` | `varchar(200)` | `NOT NULL` | — | — |
| `subject` | `varchar(200)` | `NOT NULL` | — | — |
| `body` | `text` | `NOT NULL` | — | — |
| `send_status` | `varchar(20)` | `NOT NULL` | `'sent'` | — |
| `error_message` | `text` | — | — | — |
| `sent_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `sentEmails` (imported as `import { sentEmails } from '@/db/schema'`).
