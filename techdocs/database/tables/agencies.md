# agencies

_Schema reference for the agencies table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/agencies.ts`. **11** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `tenant_id` | `uuid` | `NOT NULL` | — | `tenants.id` |
| `name` | `varchar(150)` | `NOT NULL` | — | — |
| `contact_email` | `varchar(255)` | — | — | — |
| `contact_phone` | `varchar(50)` | — | — | — |
| `notes` | `text` | — | — | — |
| `logo_path` | `varchar(500)` | — | — | — |
| `is_active` | `boolean` | `NOT NULL` | `true` | — |
| `is_internal` | `boolean` | `NOT NULL` | `false` | — |
| `is_system` | `boolean` | `NOT NULL` | `false` | — |
| `created_at` | `timestamp` | `NOT NULL` | `now()` | — |

**Drizzle name:** `agencies` (imported as `import { agencies } from '@/db/schema'`).
