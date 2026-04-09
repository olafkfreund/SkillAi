# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2026-04-09-core-mvp-foundation/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Overview

Phase 1 uses a hybrid of **Next.js Server Actions** (for mutations) and **API Routes** (for polling and data fetching from client components). All endpoints require authentication. Tenant context is injected at middleware level — no endpoint accepts `tenant_id` as a parameter.

All API routes return JSON. Error responses follow `{ error: string, code?: string }`.

---

## Server Actions

Server Actions live in `src/actions/` and are called directly from Client Components or Server Components via `import`. They handle all create/update mutations.

### `createRole(formData: FormData)`

**File:** `src/actions/roles.ts`
**Auth:** recruiter, admin
**Purpose:** Create a new job role

**Input (FormData):**
- `title` — string, required, max 255
- `description` — string, required
- `requirements` — string, optional

**Behaviour:**
1. Validate inputs with Zod
2. Wrap in `withTenant(tenantId, ...)` 
3. Insert into `roles` table
4. `revalidatePath('/roles')`
5. Return `{ roleId: string }` or `{ error: string }`

---

### `createCandidate(formData: FormData)`

**File:** `src/actions/candidates.ts`
**Auth:** recruiter, admin
**Purpose:** Upload CV file, parse text, create candidate record, trigger scoring

**Input (FormData):**
- `file` — File, required, max 10MB, accept: pdf/docx/txt
- `roleId` — UUID string, required
- `agencyId` — UUID string, optional

**Behaviour:**
1. Validate file type and size
2. Generate `{uuid}.{ext}` filename
3. Write file to `/app/uploads/{tenantId}/{filename}` 
4. Parse text: pdf-parse for PDF, mammoth for DOCX
5. Insert candidate record (cv_text, file_path, file_name, file_type)
6. Insert score record with `score_status = 'pending'`
7. Call `triggerScoring(candidateId, roleId)` — **fire and forget** (does not await)
8. Return `{ candidateId: string }`

**Error cases:**
- File too large → `{ error: 'File exceeds 10MB limit' }`
- Unsupported type → `{ error: 'Unsupported file type' }`
- Parse failure → candidate saved with empty cv_text, score marked `failed`

---

### `triggerScoring(candidateId: string, roleId: string)`

**File:** `src/actions/candidates.ts` (internal, not exported)
**Purpose:** Run Claude scoring and update score record

**Behaviour:**
1. Update score `score_status = 'processing'`
2. Fetch candidate `cv_text` and role `description + requirements`
3. Call Claude `claude-sonnet-4-6` with structured prompt
4. Parse + Zod-validate response
5. Calculate weighted `overall_score`
6. Update score record with all dimension scores, reasoning, `score_status = 'complete'`, `scored_at = NOW()`
7. On any error: set `score_status = 'failed'`, `error_message = error.message`

---

## API Routes

### `GET /api/candidates`

**File:** `src/app/api/candidates/route.ts`
**Auth:** all authenticated roles
**Purpose:** Paginated, filtered, sorted candidate list for a given role

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `roleId` | UUID | required | Filter to this role |
| `minScore` | int 0-100 | 0 | Min overall_score filter |
| `maxScore` | int 0-100 | 100 | Max overall_score filter |
| `agencyId` | UUID[] | — | Multi-select agency filter (repeat param) |
| `dateFrom` | ISO date | — | Upload date range start |
| `dateTo` | ISO date | — | Upload date range end |
| `sortBy` | string | `overall_score` | Column to sort: `overall_score`, `technical_skills_score`, `experience_level_score`, `role_fit_score`, `communication_score`, `created_at` |
| `sortDir` | `asc`\|`desc` | `desc` | Sort direction |
| `page` | int | 1 | Page number |
| `pageSize` | int | 25 | Items per page (max 100) |

**Response `200`:**
```json
{
  "data": [
    {
      "candidateId": "uuid",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "agencyName": "TechTalent Ltd",
      "overallScore": 84,
      "technicalSkillsScore": 88,
      "experienceLevelScore": 80,
      "roleFitScore": 85,
      "communicationScore": 79,
      "scoreStatus": "complete",
      "createdAt": "2026-04-09T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 47,
    "totalPages": 2
  }
}
```

**Implementation note:** Single SQL query joining `candidates` + `scores` + `agencies` with dynamic WHERE clause built by Drizzle. Server-side pagination via `offset` + `limit`.

---

### `GET /api/candidates/[id]`

**File:** `src/app/api/candidates/[id]/route.ts`
**Auth:** all authenticated roles
**Purpose:** Full candidate profile — used for candidate profile page and for polling score status

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "cvText": "Full CV text...",
  "fileName": "jane-smith-cv.pdf",
  "fileType": "pdf",
  "agencyId": "uuid",
  "agencyName": "TechTalent Ltd",
  "createdAt": "2026-04-09T10:00:00Z",
  "scores": [
    {
      "roleId": "uuid",
      "roleTitle": "Senior TypeScript Engineer",
      "overallScore": 84,
      "dimensions": {
        "technicalSkills": { "score": 88, "reasoning": "..." },
        "experienceLevel": { "score": 80, "reasoning": "..." },
        "roleFit":         { "score": 85, "reasoning": "..." },
        "communication":   { "score": 79, "reasoning": "..." }
      },
      "summary": "Strong candidate with solid TypeScript background...",
      "scoreStatus": "complete",
      "modelUsed": "claude-sonnet-4-6",
      "scoredAt": "2026-04-09T10:00:05Z"
    }
  ]
}
```

**Error `404`:** `{ "error": "Candidate not found" }` — RLS ensures cross-tenant candidates return 404, not 403

---

### `GET /api/roles`

**File:** `src/app/api/roles/route.ts`
**Auth:** all authenticated roles
**Purpose:** List all active roles for the current tenant (used in dropdowns)

**Response `200`:**
```json
{
  "data": [
    { "id": "uuid", "title": "Senior TypeScript Engineer", "createdAt": "..." }
  ]
}
```

---

### `GET /api/agencies`

**File:** `src/app/api/agencies/route.ts`
**Auth:** all authenticated roles
**Purpose:** List all agencies (used in filter sidebar multi-select)

**Response `200`:**
```json
{
  "data": [
    { "id": "uuid", "name": "TechTalent Ltd" }
  ]
}
```

---

## Auth Routes

### `POST /api/auth/[...nextauth]` and `GET /api/auth/[...nextauth]`

**File:** `src/app/api/auth/[...nextauth]/route.ts`
**Purpose:** Auth.js v5 handler — handles login, logout, session
**Note:** Standard Auth.js setup, no custom logic beyond the credentials provider and Drizzle adapter

---

## Middleware

**File:** `src/middleware.ts`
**Runs on:** `/(dashboard)(.*)` and `/api/candidates(.*)`, `/api/roles(.*)`, `/api/agencies(.*)`

**Behaviour:**
1. Get session from JWT cookie
2. If no session → redirect to `/login` (for pages) or return `401` (for API)
3. Extract `tenantId` and `role` from JWT
4. Set `x-tenant-id` and `x-user-role` request headers for downstream use
5. Check role permissions per route pattern (viewer cannot POST)

**Role permissions matrix:**

| Route | admin | recruiter | viewer |
|---|---|---|---|
| GET all pages | ✓ | ✓ | ✓ |
| createRole | ✓ | ✓ | ✗ |
| createCandidate (upload) | ✓ | ✓ | ✗ |
| DELETE any entity | ✓ | ✗ | ✗ |
