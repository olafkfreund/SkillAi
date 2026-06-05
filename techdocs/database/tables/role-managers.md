# role_managers

_Schema reference for the role_managers table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/role-managers.ts`. **7** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `role_id` | `uuid` | `NOT NULL` | — | `roles.id` |
| `user_id` | `uuid` | `NOT NULL` | — | `users.id` |
| `is_primary` | `boolean` | `NOT NULL` | `false` | — |
| `added_by` | `uuid` | — | — | `users.id` |
| `added_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `roleManagers` (imported as `import { roleManagers } from '@/db/schema'`).
