# Database Schema

This is the database schema for the spec detailed in @.agent-os/specs/2026-04-09-settings-files-export/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## New Table: `tenant_settings`

Stores encrypted per-tenant configuration values (API keys and future settings).

```sql
CREATE TABLE tenant_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         VARCHAR(100) NOT NULL,
  value       TEXT NOT NULL,           -- AES-256-GCM encrypted: "iv:authTag:encryptedHex"
  updated_by  UUID NOT NULL REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_isolation ON tenant_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_tenant_settings_lookup ON tenant_settings(tenant_id, key);
```

**Keys stored:**
- `anthropic_api_key` — Claude API key (encrypted)
- `google_api_key` — Gemini API key (encrypted, optional)

**Rationale:** Generic key-value store pattern allows future settings (webhook URLs, notification preferences) without new migrations. UNIQUE(tenant_id, key) enforces one value per setting per tenant. Value is always encrypted — never stored plaintext.

---

## Modified Table: `candidates`

Extend the `file_type` CHECK constraint to support new formats.

```sql
-- Migration: extend file_type enum
ALTER TABLE candidates DROP CONSTRAINT candidates_file_type_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'odt', 'rtf', 'txt', 'md'));
```

**Rationale:** Adding `odt`, `rtf`, `txt`, `md` to the allowed set. Existing `pdf` and `docx` records unaffected.

---

## Drizzle Schema

```typescript
// src/db/schema/tenant-settings.ts
import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

export const tenantSettings = pgTable('tenant_settings', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  key:       varchar('key', { length: 100 }).notNull(),
  value:     text('value').notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.key),
])
```
