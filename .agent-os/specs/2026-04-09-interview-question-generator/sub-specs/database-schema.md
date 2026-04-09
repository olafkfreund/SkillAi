# Database Schema

This is the database schema for the spec detailed in @.agent-os/specs/2026-04-09-interview-question-generator/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## New Tables

### `interview_packs`

Stores the metadata for each generated interview pack. One pack is generated per candidate+role pair (can be regenerated, creating a new version).

```sql
CREATE TABLE interview_packs (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id                UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  role_id                     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  generated_by                UUID NOT NULL REFERENCES users(id),
  pack_summary                TEXT,
  recommended_duration_minutes SMALLINT,
  experience_level            VARCHAR(10) NOT NULL CHECK (experience_level IN ('junior', 'mid', 'senior', 'lead')),
  includes_code_challenge     BOOLEAN NOT NULL DEFAULT false,
  generation_status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (generation_status IN ('pending', 'processing', 'complete', 'failed')),
  error_message               TEXT,
  model_used                  VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-6',
  generated_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interview_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_packs_tenant_isolation ON interview_packs
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_interview_packs_tenant ON interview_packs(tenant_id);
CREATE INDEX idx_interview_packs_candidate ON interview_packs(candidate_id);
CREATE INDEX idx_interview_packs_candidate_role ON interview_packs(candidate_id, role_id);
```

**Rationale:** Multiple packs can exist per candidate+role (recruiter can regenerate). No UNIQUE constraint on (candidate_id, role_id) — allows versioning. `generation_status` enables the same polling pattern as `scores`.

---

### `interview_questions`

Individual questions belonging to a pack. Stored as separate rows for filtering, ordering, and per-question notes.

```sql
CREATE TABLE interview_questions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_id                   UUID NOT NULL REFERENCES interview_packs(id) ON DELETE CASCADE,
  question_text             TEXT NOT NULL,
  question_type             VARCHAR(20) NOT NULL
                              CHECK (question_type IN ('behavioral', 'technical', 'situational', 'cultural')),
  difficulty                VARCHAR(10) NOT NULL
                              CHECK (difficulty IN ('junior', 'mid', 'senior')),
  competency                VARCHAR(100) NOT NULL,
  personalization_level     VARCHAR(10) NOT NULL
                              CHECK (personalization_level IN ('high', 'medium', 'low')),
  estimated_duration_minutes SMALLINT NOT NULL,
  cv_references             TEXT[],                    -- Array of CV excerpt strings
  answer_signal_strong      TEXT,
  answer_signal_acceptable  TEXT,
  answer_signal_weak        TEXT,
  follow_ups                JSONB NOT NULL DEFAULT '[]', -- [{trigger, question}]
  interviewer_notes         TEXT,                      -- Added during/after interview
  display_order             SMALLINT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_questions_tenant_isolation ON interview_questions
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_interview_questions_pack ON interview_questions(pack_id, display_order);
CREATE INDEX idx_interview_questions_tenant ON interview_questions(tenant_id);
```

**Rationale:** `cv_references` as `TEXT[]` — PostgreSQL array of strings (CV excerpts referenced by this question). `follow_ups` as `JSONB` — small, variable-length array, no need for a separate table. `display_order` controls presentation order (behavioral → technical → situational → cultural).

---

### `code_challenges`

Optional code challenge attached to a pack (one per pack maximum).

```sql
CREATE TABLE code_challenges (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_id               UUID NOT NULL REFERENCES interview_packs(id) ON DELETE CASCADE,
  title                 VARCHAR(255) NOT NULL,
  difficulty            VARCHAR(10) NOT NULL CHECK (difficulty IN ('junior', 'mid', 'senior')),
  estimated_minutes     SMALLINT NOT NULL,
  language              VARCHAR(30) NOT NULL,
  problem_description   TEXT NOT NULL,
  starter_code          TEXT NOT NULL,
  unit_tests            TEXT NOT NULL,
  evaluation_criteria   TEXT[] NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id)      -- one challenge per pack
);

ALTER TABLE code_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY code_challenges_tenant_isolation ON code_challenges
  USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_code_challenges_pack ON code_challenges(pack_id);
```

**Rationale:** Separate table (not JSONB on interview_packs) because code content can be large (2-5KB) and may need independent querying for display. UNIQUE(pack_id) enforces one challenge per pack.

---

## Drizzle Schema (TypeScript)

```typescript
// src/db/schema/interview-packs.ts
import { pgTable, uuid, varchar, text, smallint, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { candidates } from './candidates'
import { roles } from './roles'
import { users } from './users'

export const interviewPacks = pgTable('interview_packs', {
  id:                         uuid('id').primaryKey().defaultRandom(),
  tenantId:                   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  candidateId:                uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  roleId:                     uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  generatedBy:                uuid('generated_by').notNull().references(() => users.id),
  packSummary:                text('pack_summary'),
  recommendedDurationMinutes: smallint('recommended_duration_minutes'),
  experienceLevel:            varchar('experience_level', { length: 10 }).notNull(),
  includesCodeChallenge:      boolean('includes_code_challenge').notNull().default(false),
  generationStatus:           varchar('generation_status', { length: 20 }).notNull().default('pending'),
  errorMessage:               text('error_message'),
  modelUsed:                  varchar('model_used', { length: 50 }).notNull().default('claude-sonnet-4-6'),
  generatedAt:                timestamp('generated_at', { withTimezone: true }),
  createdAt:                  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// src/db/schema/interview-questions.ts
import { pgTable, uuid, varchar, text, smallint, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const interviewQuestions = pgTable('interview_questions', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  tenantId:                 uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  packId:                   uuid('pack_id').notNull().references(() => interviewPacks.id, { onDelete: 'cascade' }),
  questionText:             text('question_text').notNull(),
  questionType:             varchar('question_type', { length: 20 }).notNull(),
  difficulty:               varchar('difficulty', { length: 10 }).notNull(),
  competency:               varchar('competency', { length: 100 }).notNull(),
  personalizationLevel:     varchar('personalization_level', { length: 10 }).notNull(),
  estimatedDurationMinutes: smallint('estimated_duration_minutes').notNull(),
  cvReferences:             text('cv_references').array(),
  answerSignalStrong:       text('answer_signal_strong'),
  answerSignalAcceptable:   text('answer_signal_acceptable'),
  answerSignalWeak:         text('answer_signal_weak'),
  followUps:                jsonb('follow_ups').notNull().default([]),
  interviewerNotes:         text('interviewer_notes'),
  displayOrder:             smallint('display_order').notNull(),
  createdAt:                timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```
