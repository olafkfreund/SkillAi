# customer_frameworks

_Schema reference for the customer_frameworks table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/customer-frameworks.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](../../architecture/multi-tenancy-rls.md).

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
