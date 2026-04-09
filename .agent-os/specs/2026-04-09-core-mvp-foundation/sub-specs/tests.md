# Tests Specification

This is the tests coverage details for the spec detailed in @.agent-os/specs/2026-04-09-core-mvp-foundation/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Test Stack

- **Test runner:** Vitest (fast, native ESM, compatible with Next.js)
- **Component tests:** React Testing Library + Vitest
- **API/integration tests:** Vitest + `node-postgres` against a real test DB (no mocking the database)
- **E2E:** Playwright (smoke tests only in Phase 1)

## Mocking Requirements

| Service | Strategy |
|---|---|
| Claude API (`@anthropic-ai/sdk`) | Mock at module level with `vi.mock` — return fixture JSON matching `CandidateScoreSchema` |
| File system (`fs/promises`) | Mock in unit tests; use temp directory in integration tests |
| Auth session | Mock `auth()` from Auth.js in component/API tests to return fixture session |
| Database | **Never mock** — all integration tests use a real test PostgreSQL instance (same Docker image) seeded fresh per test suite |

---

## Unit Tests

### `src/lib/ai/claude.ts` — `scoreCandidate()`

- Returns parsed `CandidateScore` object when Claude returns valid JSON
- Throws `ZodError` when Claude returns JSON with missing `overall_score`
- Throws `ZodError` when a dimension score is outside 0-100
- Correctly calculates weighted `overall_score`: `tech*0.35 + exp*0.30 + fit*0.25 + comm*0.10`
- Handles Claude API timeout (mock timeout → expect `score_status = 'failed'`)

### `src/lib/parsers/pdf.ts` — `parsePdf()`

- Extracts text from a fixture PDF file (include small fixture in `tests/fixtures/`)
- Returns empty string (not throws) when PDF has no extractable text
- Throws `ParseError` when given non-PDF buffer

### `src/lib/parsers/docx.ts` — `parseDocx()`

- Extracts text from a fixture DOCX file
- Returns empty string (not throws) for empty DOCX
- Throws `ParseError` when given non-DOCX buffer

### `src/lib/tenant.ts` — `withTenant()`

- Executes `SET LOCAL app.tenant_id` before the wrapped function
- Does NOT leak tenant context outside the transaction
- Throws if tenantId is not a valid UUID

### `src/lib/ai/schemas.ts` — `CandidateScoreSchema`

- Validates a complete valid score object: passes
- Rejects score > 100: fails
- Rejects score < 0: fails
- Rejects missing `dimensions` key: fails
- Rejects reasoning string > 300 chars: fails

---

## Integration Tests

All integration tests run against a dedicated test database (`TEST_DATABASE_URL` env var). The test DB is reset and seeded before each test file via a `beforeAll` hook.

### Auth Flow

- `POST /api/auth/callback/credentials` with valid credentials → session cookie set, redirect to dashboard
- `POST /api/auth/callback/credentials` with wrong password → 401
- Accessing `/dashboard` without session → redirects to `/login`
- Accessing `/dashboard` with `viewer` role → page renders (read access)
- Viewer attempting `createCandidate` server action → returns permission error

### RLS Tenant Isolation

- Candidate created in Tenant A is NOT returned in `GET /api/candidates` for Tenant B session
- Score created in Tenant A is NOT returned for Tenant B session
- Direct DB query without `SET app.tenant_id` returns 0 rows for any tenant table

### `createRole` Server Action

- Valid inputs → role inserted, `revalidatePath` called, returns `{ roleId }`
- Missing `title` → returns `{ error: 'Title is required' }`
- `description` over 50,000 chars → returns validation error

### `createCandidate` Server Action

- PDF upload (fixture file) → candidate record created, `score_status = 'pending'` in scores table
- DOCX upload → candidate record created with extracted text
- File > 10MB → returns `{ error: 'File exceeds 10MB limit' }`
- Unsupported `.xls` file → returns `{ error: 'Unsupported file type' }`
- Valid upload with mocked Claude → score record transitions to `complete` with scores populated

### `GET /api/candidates`

- Returns candidates for the correct role only
- `minScore=70` → only returns candidates with `overall_score >= 70`
- `sortBy=experience_level_score&sortDir=asc` → results sorted correctly
- `page=2&pageSize=5` → correct slice, correct `pagination.total`
- `agencyId=X` → only returns candidates from agency X
- No `roleId` param → returns 400

### `GET /api/candidates/[id]`

- Returns full candidate with scores array for valid ID in tenant
- Returns 404 for valid UUID that belongs to different tenant
- Returns 404 for non-existent UUID
- `scoreStatus = 'pending'` candidate → returns partial record with `scoreStatus: 'pending'`

---

## Component Tests

### `<CvDropzone />`

- Renders upload zone with correct accept text
- Drag-and-drop of PDF file → `onFilesAccepted` called with file
- File over 10MB rejected → error message displayed
- `.xls` file rejected → error message displayed

### `<CandidateTable />`

- Renders correct number of rows from fixture data
- Click column header → `sortBy` state changes
- Score range slider change → `minScore`/`maxScore` state updates
- Row click → `onRowClick` called with candidate ID
- Pagination controls render when `totalPages > 1`

### `<FilterSidebar />`

- Agency multi-select shows all agencies from fixture data
- Selecting agency updates Zustand filter state
- Date range picker selection updates filter state
- "Clear filters" button resets all filter state to defaults

### `<ScoreChart />`

- Renders 4 bars with correct heights for fixture score data
- Scores 0-40 render with red fill class
- Scores 41-70 render with amber fill class
- Scores 71-100 render with green fill class

---

## E2E Tests (Playwright — Smoke Only)

### Happy Path — Full Ranking Flow

1. Navigate to `/login`
2. Enter `recruiter@acme.com` / `password123`
3. Redirected to `/dashboard` — assert page title visible
4. Navigate to `/roles/new`
5. Fill title + description, submit → redirected to role page
6. Click "Upload CV" → dropzone visible
7. Upload fixture PDF → candidate row appears with "Scoring..." status
8. Wait up to 15s for status to change to score (mock Claude in E2E environment)
9. Assert overall score visible in table row
10. Click candidate row → profile page loads with dimension scores

### Auth Guard

- Navigate to `/dashboard` without login → redirected to `/login`

---

## Test File Layout

```
tests/
├── unit/
│   ├── ai/
│   │   ├── claude.test.ts
│   │   └── schemas.test.ts
│   ├── parsers/
│   │   ├── pdf.test.ts
│   │   └── docx.test.ts
│   └── tenant.test.ts
├── integration/
│   ├── auth.test.ts
│   ├── rls.test.ts
│   ├── actions/
│   │   ├── createRole.test.ts
│   │   └── createCandidate.test.ts
│   └── api/
│       ├── candidates.test.ts
│       └── candidates-id.test.ts
├── components/
│   ├── cv-dropzone.test.tsx
│   ├── candidate-table.test.tsx
│   ├── filter-sidebar.test.tsx
│   └── score-chart.test.tsx
├── e2e/
│   ├── happy-path.spec.ts
│   └── auth-guard.spec.ts
└── fixtures/
    ├── sample.pdf
    ├── sample.docx
    └── score-response.json     # Claude API mock response
```
