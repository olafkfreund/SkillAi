# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2026-04-09-core-mvp-foundation/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Overview

All tables include `tenant_id` for RLS isolation. Row-Level Security is enabled on every table with a policy that filters by the `app.tenant_id` session variable set at request start. The `pgvector` extension is enabled for future Phase 2 semantic search (column present, not yet populated in Phase 1).

## PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Tables

### `tenants`

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Rationale:** Top-level isolation unit. Slug used for routing if needed. No RLS on this table (accessed pre-auth during login lookup).

---

### `users`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'recruiter'
                  CHECK (role IN ('admin', 'recruiter', 'viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

**Rationale:** Unique constraint is per-tenant (same email allowed in different tenants). `is_active` allows deactivation without deletion.

---

### `agencies`

```sql
CREATE TABLE agencies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  contact     VARCHAR(255),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY agencies_tenant_isolation ON agencies
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_agencies_tenant ON agencies(tenant_id);
```

**Rationale:** Agencies are simple reference entities in Phase 1. Notes field allows free-text agency-level notes. Full agency management UI is Phase 3.

---

### `roles`

```sql
CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT NOT NULL,
  requirements  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_tenant_isolation ON roles
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_tenant_active ON roles(tenant_id, is_active);
```

**Rationale:** `description` + `requirements` are both passed to Claude as the role context. `requirements` is optional structured text (bullet points etc). `is_active` allows archiving without deletion.

---

### `candidates`

```sql
CREATE TABLE candidates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agency_id      UUID REFERENCES agencies(id) ON DELETE SET NULL,
  name           VARCHAR(255),
  email          VARCHAR(255),
  cv_text        TEXT NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  file_type      VARCHAR(10) NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
  embedding      vector(1536),              -- Populated in Phase 2
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidates_tenant_isolation ON candidates
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_candidates_tenant ON candidates(tenant_id);
CREATE INDEX idx_candidates_tenant_agency ON candidates(tenant_id, agency_id);
CREATE INDEX idx_candidates_tenant_created ON candidates(tenant_id, created_at DESC);

-- HNSW index for Phase 2 semantic search (created now, used later)
CREATE INDEX idx_candidates_embedding ON candidates
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Rationale:** `name` and `email` are nullable — not all CVs include them in extractable positions. `cv_text` is the full extracted text used for AI scoring. `embedding` column created now so the HNSW index exists when Phase 2 populates it. `file_path` is relative to the uploads volume root.

---

### `scores`

```sql
CREATE TABLE scores (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id          UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  role_id               UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  overall_score         SMALLINT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  technical_skills_score    SMALLINT NOT NULL CHECK (technical_skills_score BETWEEN 0 AND 100),
  experience_level_score    SMALLINT NOT NULL CHECK (experience_level_score BETWEEN 0 AND 100),
  role_fit_score            SMALLINT NOT NULL CHECK (role_fit_score BETWEEN 0 AND 100),
  communication_score       SMALLINT NOT NULL CHECK (communication_score BETWEEN 0 AND 100),
  technical_skills_reasoning    TEXT,
  experience_level_reasoning    TEXT,
  role_fit_reasoning            TEXT,
  communication_reasoning       TEXT,
  summary                       TEXT,
  model_used             VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-6',
  score_status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                           CHECK (score_status IN ('pending', 'processing', 'complete', 'failed')),
  error_message          TEXT,
  scored_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, role_id)   -- One score per candidate+role pair
);

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY scores_tenant_isolation ON scores
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_scores_tenant_role ON scores(tenant_id, role_id);
CREATE INDEX idx_scores_candidate ON scores(candidate_id);
CREATE INDEX idx_scores_status ON scores(tenant_id, score_status);
CREATE INDEX idx_scores_overall ON scores(tenant_id, role_id, overall_score DESC);
```

**Rationale:** `UNIQUE (candidate_id, role_id)` prevents duplicate scoring runs. `score_status` enables the client polling pattern. `model_used` records which Claude model version was used (important for audit as models evolve). `error_message` captures failures for debugging.

---

### `notes`

```sql
CREATE TABLE notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_tenant_isolation ON notes
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_notes_candidate ON notes(candidate_id, created_at DESC);
```

**Rationale:** Notes table is created in Phase 1 schema so the DB is stable for Phase 3's notes UI. Notes are append-style; edit is tracked via `updated_at`.

---

## Drizzle Schema Files

Each table maps to a file in `src/db/schema/`. Example for `scores`:

```typescript
// src/db/schema/scores.ts
import { pgTable, uuid, smallint, text, varchar, timestamp, check, unique } from 'drizzle-orm/pg-core'
import { candidates } from './candidates'
import { roles } from './roles'
import { tenants } from './tenants'

export const scores = pgTable('scores', {
  id:                          uuid('id').primaryKey().defaultRandom(),
  tenantId:                    uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  candidateId:                 uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  roleId:                      uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  overallScore:                smallint('overall_score').notNull(),
  technicalSkillsScore:        smallint('technical_skills_score').notNull(),
  experienceLevelScore:        smallint('experience_level_score').notNull(),
  roleFitScore:                smallint('role_fit_score').notNull(),
  communicationScore:          smallint('communication_score').notNull(),
  technicalSkillsReasoning:    text('technical_skills_reasoning'),
  experienceLevelReasoning:    text('experience_level_reasoning'),
  roleFitReasoning:            text('role_fit_reasoning'),
  communicationReasoning:      text('communication_reasoning'),
  summary:                     text('summary'),
  modelUsed:                   varchar('model_used', { length: 50 }).notNull().default('claude-sonnet-4-6'),
  scoreStatus:                 varchar('score_status', { length: 20 }).notNull().default('pending'),
  errorMessage:                text('error_message'),
  scoredAt:                    timestamp('scored_at', { withTimezone: true }),
  createdAt:                   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.candidateId, t.roleId),
])
```

## RLS Setup Migration

Run once on DB init (included in seed/init script):

```sql
-- Function to safely set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tenant_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Seed Data

Dev seed creates:
- 1 tenant: `{ name: 'Acme Recruiting', slug: 'acme' }`
- 1 admin user: `admin@acme.com` / `password123`
- 1 recruiter user: `recruiter@acme.com` / `password123`
- 2 agencies: `TechTalent Ltd`, `FastHire Agency`
- 1 role: `Senior TypeScript Engineer`
