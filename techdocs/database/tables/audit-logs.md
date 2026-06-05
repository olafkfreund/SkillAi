# audit_logs

_Schema reference for the audit_logs table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/audit-logs.ts`. **10** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `user_id` | `uuid` | — | — | — |
| `user_email` | `varchar(200)` | — | — | — |
| `action` | `varchar(100)` | `NOT NULL` | — | — |
| `entity_type` | `varchar(50)` | `NOT NULL` | — | — |
| `entity_id` | `uuid` | — | — | — |
| `entity_label` | `varchar(200)` | — | — | — |
| `metadata` | `jsonb` | — | — | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `auditLogs` (imported as `import { auditLogs } from '@/db/schema'`).
