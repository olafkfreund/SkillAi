# email_templates

_Schema reference for the email_templates table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/email-templates.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `name` | `varchar(80)` | `NOT NULL` | — | — |
| `category` | `varchar(40)` | `NOT NULL` | — | — |
| `subject` | `varchar(200)` | `NOT NULL` | — | — |
| `body` | `text` | `NOT NULL` | — | — |
| `is_default` | `boolean` | `NOT NULL` | `false` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |
| `updated_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `emailTemplates` (imported as `import { emailTemplates } from '@/db/schema'`).
