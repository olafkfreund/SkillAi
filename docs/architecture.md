# Architecture

This document describes the system design, data model, multi-tenancy approach, and AI pipeline.

---

## Overview

SkillAI is a Next.js 15 App Router application. All pages and API routes run on a single Node.js server. The database is PostgreSQL 17 with the pgvector extension for semantic search.

```
Browser
  |
  | HTTPS
  v
Next.js Server (App Router)
  |-- Server Components: data fetching and rendering
  |-- Server Actions: mutations (forms)
  |-- API Routes: polling, exports, OAuth callbacks
  |
  v
PostgreSQL 17 + pgvector
  |
  v
AI APIs (Anthropic Claude, Google Gemini)
```

---

## Multi-Tenancy

Every table includes a `tenant_id UUID NOT NULL` column. Row-Level Security (RLS) is enabled on all tables with a policy that enforces:

```sql
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
```

At the start of every request, the middleware reads the tenant ID from the JWT session and passes it via the `x-tenant-id` header. The `withTenant()` helper (in `src/db/index.ts`) sets the PostgreSQL session variable before any query:

```sql
SET LOCAL app.tenant_id = '<uuid>';
```

This means it is architecturally impossible for application code to read data belonging to another tenant, even if a query is written incorrectly.

---

## Authentication

Auth.js v5 with a credentials provider. On sign-in, the user's tenant ID and role are embedded in the JWT. The middleware reads the JWT on every request and forwards tenant ID, user ID, and role as HTTP headers to server components and server actions.

Three roles exist: `admin`, `recruiter`, and `viewer`. Role checks use the `requireRole()` helper from `src/lib/auth/require-role.ts`.

---

## AI Scoring Pipeline

When a CV is uploaded and scored against a role, the following steps occur:

1. The CV file is parsed to plain text using `pdf-parse` (PDF), `mammoth` (DOCX), or the appropriate parser for other formats.
2. A `score` record is created with `status = 'pending'`.
3. The scoring action returns immediately (the user sees a "Scoring..." state).
4. A background task (using Next.js `after()`) calls the AI scoring function.
5. The AI returns a structured JSON score matching the `CandidateScore` Zod schema.
6. The score record is updated to `status = 'complete'` with all dimension scores and reasoning.
7. The frontend polls the score status API route every three seconds until complete.

The AI model used is determined by the tenant's `default_ai_model` setting. If set to `gemini`, scoring uses `scoreCandidateWithGemini()`. Otherwise, Claude is used.

---

## Interview Pack Generation Pipeline

When a recruiter requests an interview pack for a candidate and role:

1. A `interview_packs` record is created with `generation_status = 'pending'`.
2. The action returns the pack ID immediately and redirects the user to the pack page.
3. A background task runs two AI stages:
   - Stage 1: `extractCvProfile()` — extracts structured profile data from the CV text
   - Stage 2: `generateQuestions()` — produces 8-12 personalised questions with scoring rubrics
4. Questions and any code challenge are written to the database.
5. The pack status is set to `complete`.

If the server restarts mid-generation (common in development with hot reload), the pack status is detected as stuck. Packs in `pending` or `processing` state for more than 3 minutes are considered stuck and the UI shows a force-retry button.

---

## CV Pre-Processing

PDF extraction with `pdf-parse` strips all newlines, producing a flat string. SkillAI includes a multi-step pre-processor (`preprocessCv()` in `src/components/candidates/cv-display.tsx`) that:

1. Detects flat text by checking line count and average line length
2. Splits contact label fields onto their own lines
3. Converts bullet character variants to standard newline-separated bullets
4. Detects ALL-CAPS section headers using regex and injects newlines before them
5. Handles fused lines where a section keyword is run into the content that follows it

The output is then parsed into typed blocks (name, tagline, contact, header, role, bullet, plain) and rendered with appropriate styling.

---

## Vector Search

Candidate embeddings are generated using the Gemini `text-embedding-001` model, producing 768-dimensional vectors. These are stored in a `vector(768)` column on the `candidates` table, indexed with HNSW for fast approximate nearest-neighbour search.

The semantic search endpoint accepts a query string, generates its embedding, and returns candidates ordered by cosine similarity.

---

## File Structure

```
src/
  actions/         Server actions (mutations called from forms and client components)
  app/             Next.js App Router pages and API routes
    (dashboard)/   Authenticated dashboard pages
    api/           REST API routes (polling, exports, OAuth)
    (auth)/        Login page
  components/      React components
    candidates/    Candidate-related UI
    interview/     Interview pack UI
    roles/         Role UI
    agencies/      Agency UI
    layout/        Sidebar, shell
  db/
    schema/        Drizzle ORM schema definitions (one file per table)
    index.ts       withTenant() helper and db client
  lib/
    ai/            AI clients (claude.ts, gemini.ts, scoring.ts, interview.ts, role-tags.ts)
    auth/          Auth helpers (require-role.ts, types.ts)
    calendar/      Google and Microsoft calendar integration
```

---

## Background Jobs

Next.js `after()` (from `next/server`) is used for all background work. This API runs a callback after the HTTP response is sent, with a guaranteed execution promise tracked by the runtime. It is the recommended approach for Next.js 15 and works in both development and production without an external queue.

In development, hot reloads can interrupt `after()` tasks. The application detects and recovers from this automatically by marking stale packs as failed and allowing retry.
