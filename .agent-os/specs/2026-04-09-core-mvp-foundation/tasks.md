# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-04-09-core-mvp-foundation/spec.md

> Created: 2026-04-09
> Status: Ready for Implementation

## Tasks

- [x] 1. Project Scaffold — Docker Compose, Next.js 16, TypeScript, Drizzle, Vitest
  - [x] 1.1 Initialise Next.js 16 app with TypeScript (scaffolded via create-next-app, name constraint workaround used)
  - [x] 1.2 Install all Phase 1 dependencies from the technical-spec dependency table
  - [x] 1.3 Configure `drizzle.config.ts` pointing to `src/db/schema/` and `src/db/migrations/`
  - [x] 1.4 Configure `vitest.config.ts` with jsdom environment, path aliases, and coverage
  - [x] 1.5 Write `docker-compose.yml` with `app` (Next.js) + `db` (`pgvector/pgvector:pg17`) services, named volumes `postgres_data` and `uploads_data`, internal network `skillai_net`
  - [x] 1.6 Write `docker-compose.override.yml` for dev: source volume mount (excluding `node_modules`), `NODE_ENV=development`, DB exposed on port 5433 (5432 already in use on host)
  - [x] 1.7 Write multi-stage `Dockerfile`: `deps` → `development` → `builder` (with `output: 'standalone'`) → `runner` stages
  - [x] 1.8 Add `docker/init-db.sql` that installs `uuid-ossp` and `vector` extensions + RLS helper function, mounted via `docker-entrypoint-initdb.d`
  - [x] 1.9 Verified: both services healthy, pgvector 0.8.2 installed, HTTP 200 from localhost:3000

- [x] 2. Database Schema — all 11 tables with RLS, indexes, and seed data
  - [x] 2.1 Write integration test: RLS isolation — tenant A cannot see tenant B agencies; test skipped unless DATABASE_URL set (`tests/integration/db/rls-isolation.test.ts`)
  - [x] 2.2 Create Drizzle schema files for all 11 tables: `tenants`, `users`, `agencies`, `roles`, `candidates`, `scores`, `notes`, `interview_packs`, `interview_questions`, `code_challenges`, `tenant_settings`
  - [x] 2.3 Implement `src/db/index.ts`: Drizzle client + `withTenant(tenantId, fn)` wrapping operations in a transaction and calling `set_tenant_context()`
  - [x] 2.4 RLS enabled via `enableRLS()` + `pgPolicy()` for all tenant-scoped tables; subquery policies for child tables without tenant_id
  - [x] 2.5 `candidates.embedding` stored as `text` (Phase 2 will add vector type + HNSW index via migration); all other indexes created
  - [x] 2.6 `npm run db:generate` → verified `src/db/migrations/0000_lumpy_rage.sql` contains all 11 tables, 7 enums, RLS policies, and indexes
  - [x] 2.7 Write `src/db/seed.ts`: 1 tenant, admin + recruiter users, 2 agencies, 1 role (`npm run db:seed`)
  - [x] 2.8 Write unit test for `withTenant()`: 6 tests using `vi.hoisted()` mock pattern (`tests/unit/db/with-tenant.test.ts`)
  - [x] 2.9 All tests pass: `npm run test` — 6 passed, 4 skipped (integration tests require DB)

- [x] 3. Authentication — Auth.js v5, credentials provider, JWT, RBAC middleware
  - [x] 3.1 Unit tests: `authorizeUser()` — valid/invalid creds, null on unknown user, no passwordHash in response (`tests/unit/auth/credentials.test.ts`)
  - [x] 3.2 `src/lib/auth.ts`: NextAuth v5 credentials provider, JWT strategy, jwt/session callbacks embed tenantId + role into token; `src/lib/auth/authorize.ts` contains pure `authorizeUser()` for testability
  - [x] 3.3 `src/app/api/auth/[...nextauth]/route.ts` Auth.js GET/POST handler
  - [x] 3.4 JWT sessions used (no DB adapter needed for credentials-only auth)
  - [x] 3.5 `src/middleware.ts`: protects dashboard + API routes; forwards x-tenant-id, x-user-role, x-user-id headers; returns 401 JSON for API, redirect for dashboard
  - [x] 3.6 `src/lib/auth/require-role.ts`: `hasRole()` + `requireRole()` with role hierarchy (viewer < recruiter < admin)
  - [x] 3.7 `src/app/(auth)/login/page.tsx` + `src/components/auth/login-form.tsx`: client form with signIn, error display, loading spinner
  - [x] 3.8 `src/app/(dashboard)/layout.tsx` + `src/components/layout/sidebar.tsx`: role-filtered nav (Settings admin-only)
  - [x] 3.9 All tests pass: 16 passed, 4 skipped — `npm run test`

- [ ] 4. CV Upload & Parsing — drag-and-drop, text extraction, file storage
  - [ ] 4.1 Write unit tests for `parsePdf()` and `parseDocx()` using fixture files in `tests/fixtures/` (sample.pdf, sample.docx); assert text extraction returns non-empty string
  - [ ] 4.2 Write unit tests for `parsePdf()` and `parseDocx()` error cases: wrong buffer type throws `ParseError`
  - [ ] 4.3 Implement `src/lib/parsers/pdf.ts`: wrap `pdf-parse`, handle empty text result, throw typed `ParseError` on failure
  - [ ] 4.4 Implement `src/lib/parsers/docx.ts`: wrap `mammoth.extractRawText()`, handle empty result, throw typed `ParseError` on failure
  - [ ] 4.5 Write integration test for `createCandidate` server action: PDF upload → candidate row inserted + score row with `score_status='pending'`; file > 10MB → returns error; unsupported type → returns error
  - [ ] 4.6 Implement `createCandidate(formData)` server action in `src/actions/candidates.ts`: validate file, write to `/app/uploads/{tenantId}/{uuid}.{ext}`, parse text, insert candidate + score records, call `triggerScoring` fire-and-forget
  - [ ] 4.7 Build `<CvDropzone />` component (`src/components/upload/cv-dropzone.tsx`): react-dropzone with PDF/DOCX accept, 10MB limit, error messages for rejected files, upload progress indicator
  - [ ] 4.8 Write component test for `<CvDropzone />`: accepts PDF, rejects oversized file, rejects unsupported type
  - [ ] 4.9 Verify all tests pass: `npm run test`

- [ ] 5. Job Role Management — create/list/view roles
  - [ ] 5.1 Write integration tests for `createRole` server action: valid inputs → role inserted; missing title → validation error; returns `{ roleId }`
  - [ ] 5.2 Implement `createRole(formData)` server action in `src/actions/roles.ts`: Zod validation, `withTenant` DB insert, `revalidatePath('/roles')`
  - [ ] 5.3 Write integration test for `GET /api/roles`: returns only roles for current tenant; empty array when no roles exist
  - [ ] 5.4 Implement `GET /api/roles` route: query roles table with RLS-aware `withTenant` wrapper, return active roles sorted by `created_at DESC`
  - [ ] 5.5 Build role creation form `src/components/roles/role-form.tsx`: shadcn/ui `Form`, `Input`, `Textarea` with Zod client-side validation; submits to `createRole` server action
  - [ ] 5.6 Build roles list page `src/app/(dashboard)/roles/page.tsx`: fetches roles server-side, renders list with "New Role" button
  - [ ] 5.7 Build new role page `src/app/(dashboard)/roles/new/page.tsx`: renders `<RoleForm />`
  - [ ] 5.8 Build role detail page `src/app/(dashboard)/roles/[id]/page.tsx`: shows role title + description, renders `<CvDropzone />` for uploads, and candidate table (empty state initially — full table built in Task 8)
  - [ ] 5.9 Verify all tests pass: `npm run test`

- [ ] 6. AI Ranking Engine — Claude structured output scoring
  - [ ] 6.1 Write unit tests for `CandidateScoreSchema`: valid response passes; score > 100 fails; score < 0 fails; missing dimension fails; reasoning > 300 chars fails
  - [ ] 6.2 Write unit tests for `scoreCandidate()`: valid Claude mock response → returns parsed `CandidateScore`; invalid JSON from Claude → throws; Claude API error → throws with message
  - [ ] 6.3 Write unit test for weighted `overall_score` calculation: `tech=100, exp=100, fit=100, comm=100 → 100`; `tech=80, exp=60, fit=70, comm=50 → 70` (80×0.35 + 60×0.30 + 70×0.25 + 50×0.10)
  - [ ] 6.4 Define `CandidateScoreSchema` (Zod) in `src/lib/ai/schemas.ts` per technical-spec definition
  - [ ] 6.5 Implement `scoreCandidate(cvText, roleDescription)` in `src/lib/ai/claude.ts`: build system + user prompts, call `anthropic.messages.create()` with `claude-sonnet-4-6`, parse JSON, validate with Zod, calculate weighted overall_score
  - [ ] 6.6 Write integration test for `triggerScoring()`: with mocked Claude → score record transitions from `pending` → `complete` with all dimension scores populated; Claude error → score marked `failed` with `error_message`
  - [ ] 6.7 Implement `triggerScoring(candidateId, roleId)` internal function in `src/actions/candidates.ts`: fetch candidate + role, call `scoreCandidate()`, update score record with all fields and `score_status='complete'`; catch all errors → set `score_status='failed'`
  - [ ] 6.8 Verify all tests pass: `npm run test`

- [ ] 7. Ranked Candidate List — TanStack Table with sort, filter sidebar, pagination
  - [ ] 7.1 Write integration tests for `GET /api/candidates`: returns correct candidates for roleId; `minScore=70` filter works; `sortBy=experience_level_score&sortDir=asc` returns correct order; `page=2&pageSize=5` returns correct slice with pagination metadata; `agencyId` filter returns only agency candidates; missing `roleId` returns 400
  - [ ] 7.2 Implement `GET /api/candidates` route (`src/app/api/candidates/route.ts`): parse + validate query params with Zod, build dynamic Drizzle query with joins (candidates + scores + agencies), apply all filters, sort, paginate, return JSON
  - [ ] 7.3 Build `<FilterSidebar />` component (`src/components/candidates/filter-sidebar.tsx`): overall score range slider (shadcn/ui Slider), date range picker (shadcn/ui Calendar), agency multi-select (shadcn/ui Command/Popover); state in Zustand, synced to URL search params
  - [ ] 7.4 Write component test for `<FilterSidebar />`: agency selection updates state; clear filters resets to defaults
  - [ ] 7.5 Build `<CandidateTable />` component (`src/components/candidates/candidate-table.tsx`): TanStack Table with columns (rank, name, overall score, 4 dimension scores, uploaded date, agency); server-side sort via URL params; click row navigates to profile; "Scoring..." badge for `score_status='pending'` rows
  - [ ] 7.6 Write component test for `<CandidateTable />`: renders rows from fixture data; column header click changes sort URL param; row click calls navigation
  - [ ] 7.7 Wire `<FilterSidebar />` + `<CandidateTable />` into role detail page `src/app/(dashboard)/roles/[id]/page.tsx`: TanStack Query fetches `GET /api/candidates` with current filter/sort/page state from Zustand; re-fetches on state change
  - [ ] 7.8 Build pagination controls below table: shadcn/ui `Pagination` component; previous/next/page numbers; shows "Showing X-Y of Z candidates"
  - [ ] 7.9 Verify all tests pass: `npm run test`

- [ ] 8. Candidate Profile View — full CV, dimension scores, reasoning
  - [ ] 8.1 Write integration tests for `GET /api/candidates/[id]`: returns full candidate with scores array for valid in-tenant ID; returns 404 for cross-tenant ID; returns 404 for non-existent ID; `scoreStatus='pending'` candidate returns partial record
  - [ ] 8.2 Implement `GET /api/candidates/[id]` route (`src/app/api/candidates/[id]/route.ts`): fetch candidate + all associated scores with role titles; return full profile JSON per api-spec
  - [ ] 8.3 Build `<ScoreChart />` component (`src/components/candidates/score-chart.tsx`): recharts horizontal bar chart, 4 dimension bars, colour bands (0-40 red, 41-70 amber, 71-100 green), score label on each bar
  - [ ] 8.4 Write component test for `<ScoreChart />`: 4 bars render; score 35 applies red class; score 65 applies amber class; score 80 applies green class
  - [ ] 8.5 Build candidate profile page `src/app/(dashboard)/candidates/[id]/page.tsx`: TanStack Query fetches `GET /api/candidates/{id}`; renders name/email/agency header, `<ScoreChart />`, per-dimension reasoning accordion (shadcn/ui Accordion), full CV text in scrollable pre-formatted block, AI summary section, "Back to role" breadcrumb
  - [ ] 8.6 Add score status polling to profile page: if `scoreStatus='pending'`, poll `GET /api/candidates/{id}` every 2 seconds using TanStack Query `refetchInterval`; stop polling when `scoreStatus='complete'` or `'failed'`; show loading skeleton on pending state
  - [ ] 8.7 Write Playwright E2E smoke test: login → create role → upload fixture PDF → wait for score → verify score visible in table → click row → verify profile page loads with dimension scores
  - [ ] 8.8 Write Playwright E2E auth guard test: navigate to `/dashboard` without login → assert redirect to `/login`
  - [ ] 8.9 Run full test suite including E2E: `npm run test && npm run test:e2e`
  - [ ] 8.10 Verify all 3 browser-testable deliverables from spec.md work end-to-end in Docker
