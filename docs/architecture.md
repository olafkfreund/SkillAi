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

Four roles exist: `admin`, `recruiter`, `hiring_manager`, and `viewer`. Role checks use the `requireRole()` helper from `src/lib/auth/require-role.ts`. Roles are ordered by rank — `viewer` (0), `hiring_manager` (0.5), `recruiter` (1), `admin` (2). The `hiring_manager` rank deliberately sits between `viewer` and `recruiter` so existing `requireRole(_, 'recruiter')` guards continue to block managers without any call-site changes.

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

---

## MCP Integration Architecture

claude-desktop and other MCP clients talk to SkillAI through a two-tier transport: a standalone stdio bridge (`skillai-mcp`) and an in-process HTTP endpoint (`/api/mcp`).

```
claude-desktop  <--stdio-->  skillai-mcp (bridge)  <--HTTPS-->  /api/mcp (in-process)  -->  withTenant()  -->  Postgres + RLS
                                  |                                  |
                                  |                                  +-- 48 tools / 4 resources / 3 prompts
                                  |                                  +-- bearer-token auth + scope check
                                  |                                  +-- per-token + per-tenant rate limit
                                  |                                  +-- audit log per call
                                  |                                  +-- write tools require `confirmed: true`
                                  +-- transport adapter only -- no business logic
```

The bridge (`skillai-mcp/`) is a transport adapter: a small Node.js binary that reads `SKILLAI_URL` and `SKILLAI_TOKEN` from its environment, speaks MCP stdio to the client, and forwards every call as an HTTPS request to `/api/mcp`. It carries no business logic. All authorisation, scope enforcement, RLS scoping, rate limiting, audit logging, and the 48 tool implementations live in the Next.js app itself (`src/app/api/mcp/route.ts`, `src/lib/mcp/`). This means the same security stack protects MCP calls as protects the web UI and REST API — there is one set of policies, not three.

The MCP endpoint uses the streamable-HTTP transport. Tools are scoped (`read` / `write` / `admin`, with `admin > write > read`) and write tools refuse to execute unless the caller passes `confirmed: true` in the arguments — this is how accidental destructive calls from chat are prevented.

---

## API Tokens & Rate Limiting

A new `api_tokens` table stores tenant-scoped tokens with the following shape:

| Column | Notes |
|---|---|
| `id` | UUID PK |
| `tenant_id` | RLS-scoped |
| `user_id` | The minting user; the token impersonates this identity |
| `name` | Human-readable label |
| `scope` | `read` / `write` / `admin` |
| `secret_hash` | argon2 hash via `@node-rs/argon2` |
| `prefix` | First 12 chars of the secret, plaintext, for identification |
| `last_used_at` | Updated on every authenticated call |
| `revoked_at` | Soft revoke; `withApiAuth` rejects revoked tokens |

Token format is `skl_<env>_<24-base62>` where `<env>` is `prod` / `staging` / `dev`. The full secret is shown to the user once at mint time and never recoverable — argon2 hashes are one-way.

Authentication runs through `withApiAuth` in `src/lib/api/auth-middleware.ts`. The middleware:

1. Pulls the bearer token from the `Authorization` header
2. Looks up the row by prefix, then verifies argon2 against `secret_hash`
3. Confirms the token is not revoked
4. Sets the tenant context via `withTenant()` so RLS applies for the rest of the request
5. Enforces scope (`admin > write > read`)
6. Updates `last_used_at`
7. Records an audit-log entry

Rate limiting is sliding-window, Postgres-backed, and applied at three layers: per-token, per-tenant, and per-write-operation. Limits are configurable in `tenant_settings`. See `src/lib/api/rate-limit.ts` and `src/lib/api/rate-limit-config.ts`.

---

## Hiring Manager Persona

The `hiring_manager` role is the third user persona alongside `recruiter` and `viewer`. The role is supported by two new tables:

| Table | Purpose |
|---|---|
| `role_managers` | Many-to-many: which managers are assigned to which roles. `is_primary` flag distinguishes the lead manager. Any-one-approves semantics in v1. |
| `candidate_role_approvals` | One row per `(role × candidate × manager)`. Decision is `pending` / `approved` / `rejected` with optional comment. Shortlist state is derived (`pending` / `in_review` / `complete`) — not stored. |

Manager-facing pages reuse the existing audience sanitisation pattern via `audience='manager'`. The `sanitiseForAudience()` helper strips rates, margins, agency information, and internal notes; only notes flagged `is_shareable=true` are exposed. Edit controls become read-only. The same pattern applies to the manager-facing PDF export and to MCP tools called by manager-scoped tokens.

The audit trail gains four new actions: `shortlist.sent`, `candidate.approved_by_manager`, `candidate.rejected_by_manager`, and `role.manager_assigned`.

---

## Theme & Token System

Light / dark mode is implemented via `next-themes` v1 with `enableSystem` for OS preference detection. The token model lives in `src/app/globals.css` as CSS variables, organised into two layers:

- **Surface tokens** — `--color-bg-app`, `--color-bg-elevated`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-border`, `--color-accent`. Used by every dashboard surface.
- **Status-pill tokens** — twelve dedicated tokens for status colours (new / shortlisted / interviewing / offered / hired / rejected, plus the four AI-pipeline states and two derived approval states). Each pill has its own background and foreground variable so contrast is correct in both modes.

Each token has a `light` and `dark` value. Both have been verified against WCAG AA contrast thresholds. Approximately 325 components migrated from hard-coded Tailwind colour utilities to token references during the v1 rollout. Detail pages, modals, and forms are migrating incrementally — see Epic [#103](https://github.com/olafkfreund/SkillAi/issues/103) for tracking.

The toggle component lives in `src/components/theme/theme-toggle.tsx` and is mounted in the sidebar above sign-out.

---

## Branding Logo Storage

Agency and customer logos are stored on disk under `{tenantId}/logos/{uuid}.{ext}` within the configured uploads root. Helpers in `src/lib/branding/store.ts` expose two functions: `getLogoRelativePath()` (used for storage in DB columns and as the URL-route segment) and `getLogoAbsolutePath()` (used to read from disk). **The two must agree on the path layout.** A bug in PR #98 broke logo serving because the route handler reconstructed the path from `tenantId + filename` while the store wrote `tenantId + 'logos' + filename` — keep this symmetry intact when extending the path scheme.

Accepted MIME types are PNG, JPEG, and WebP only. SVG is rejected because of the XSS surface on inline rendering. The size cap is 2 MB. Lists render at 32 px, detail headers at 64 px, PDFs at 32 px. The fallback when no logo is set is an initials avatar derived from the entity name.
