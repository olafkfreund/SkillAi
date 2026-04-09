# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-04-09-core-mvp-foundation/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Technical Requirements

### Project Structure

```
skillai/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # Authenticated shell with sidebar
│   │   │   ├── page.tsx            # Dashboard home
│   │   │   ├── roles/
│   │   │   │   ├── page.tsx        # Role list
│   │   │   │   ├── new/page.tsx    # Create role form
│   │   │   │   └── [id]/page.tsx   # Role detail + candidate list
│   │   │   └── candidates/
│   │   │       └── [id]/page.tsx   # Candidate profile view
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── candidates/
│   │       │   ├── route.ts        # GET list
│   │       │   └── [id]/route.ts   # GET single
│   │       └── upload/route.ts     # POST file upload
│   ├── actions/                    # Next.js Server Actions
│   │   ├── candidates.ts           # createCandidate, rankCandidate
│   │   └── roles.ts                # createRole, updateRole
│   ├── db/
│   │   ├── index.ts                # Drizzle client + RLS helper
│   │   ├── schema/
│   │   │   ├── tenants.ts
│   │   │   ├── users.ts
│   │   │   ├── candidates.ts
│   │   │   ├── roles.ts
│   │   │   ├── scores.ts
│   │   │   ├── agencies.ts
│   │   │   └── notes.ts
│   │   └── migrations/             # Drizzle Kit output
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── claude.ts           # Claude client + scoring function
│   │   │   └── schemas.ts          # Zod schema for CandidateScore
│   │   ├── parsers/
│   │   │   ├── pdf.ts              # pdf-parse wrapper
│   │   │   └── docx.ts             # mammoth wrapper
│   │   ├── auth.ts                 # Auth.js config
│   │   └── tenant.ts               # Tenant context helpers
│   └── components/
│       ├── ui/                     # shadcn/ui generated components
│       ├── candidates/
│       │   ├── candidate-table.tsx # TanStack Table implementation
│       │   ├── filter-sidebar.tsx  # Score/date/agency filters
│       │   └── score-chart.tsx     # Dimension score bar chart
│       ├── roles/
│       │   └── role-form.tsx
│       └── upload/
│           └── cv-dropzone.tsx
├── docker-compose.yml
├── docker-compose.override.yml     # Dev overrides (volumes, ports)
├── Dockerfile
├── drizzle.config.ts
└── auth.config.ts
```

### Docker Compose Architecture

**Development (`docker-compose.override.yml` applied automatically):**
- `app`: Next.js dev server on port 3000, source code volume-mounted for hot reload, `node_modules` excluded from mount
- `db`: `pgvector/pgvector:pg17`, persistent named volume `postgres_data`, health check via `pg_isready`
- Internal network: `skillai_net` — services communicate by service name

**Production (multi-stage Dockerfile):**
- Stage 1 `deps`: Install dependencies only
- Stage 2 `builder`: Build Next.js with `output: 'standalone'`
- Stage 3 `runner`: Copy standalone output, ~110MB final image
- CV uploads mounted as named volume `uploads_data` at `/app/uploads`

### Authentication Flow

1. User POSTs credentials to Auth.js `credentials` provider
2. Provider queries DB for user by email, verifies bcrypt password hash
3. On success: JWT created containing `{ userId, tenantId, role }`
4. JWT stored in httpOnly cookie (sameSite: lax)
5. Next.js middleware (`src/middleware.ts`) runs on all `/(dashboard)/*` routes:
   - Verifies JWT
   - Extracts `tenantId`, sets it in request headers for downstream use
   - Checks `role` against route permissions
6. Each Server Action / API route calls `setTenantContext(tenantId)` which executes `SET LOCAL app.tenant_id = '...'` before any Drizzle query

### RLS Enforcement Pattern

```typescript
// src/db/index.ts
export async function withTenant<T>(
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
    return fn(tx)
  })
}
```

All Server Actions and API routes must wrap DB calls in `withTenant()`. Direct `db.*` calls outside this wrapper are forbidden.

### AI Ranking Engine

**Input:** `{ roleDescription: string, cvText: string }`

**Claude prompt structure:**
```
System: You are an expert recruiter evaluating candidates. 
You MUST respond with valid JSON matching the provided schema exactly.

User: Evaluate this candidate against the job role.

Job Role:
<role>{{roleDescription}}</role>

Candidate CV:
<cv>{{cvText}}</cv>

Score the candidate on these dimensions (0-100):
- technical_skills: Match of technical skills to requirements
- experience_level: Years and relevance of experience
- role_fit: Overall suitability for this specific role
- communication_indicators: Writing quality and clarity of CV

Return JSON only.
```

**Structured output schema (Zod):**
```typescript
const CandidateScoreSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  dimensions: z.object({
    technical_skills: z.object({ score: z.number().int().min(0).max(100), reasoning: z.string().max(300) }),
    experience_level: z.object({ score: z.number().int().min(0).max(100), reasoning: z.string().max(300) }),
    role_fit:         z.object({ score: z.number().int().min(0).max(100), reasoning: z.string().max(300) }),
    communication_indicators: z.object({ score: z.number().int().min(0).max(100), reasoning: z.string().max(300) }),
  }),
  summary: z.string().max(500),
})
```

**Claude API call:**
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userPrompt }],
})
// Parse and validate with Zod — throw if schema mismatch
```

**overall_score calculation:** Weighted average: `technical_skills * 0.35 + experience_level * 0.30 + role_fit * 0.25 + communication_indicators * 0.10`

### CV Upload Flow

1. User drags files onto `<CvDropzone>` (react-dropzone, accept: `.pdf .docx`, maxSize: 10MB)
2. Form submits via Server Action `createCandidate(formData)`
3. Server Action:
   a. Validates file type and size
   b. Generates UUID filename, writes to `/app/uploads/{tenantId}/{uuid}.{ext}`
   c. Calls parser (pdf-parse or mammoth) to extract text
   d. Inserts candidate record to DB
   e. Calls `rankCandidate(candidateId, roleId)` — triggers Claude scoring asynchronously
   f. Returns candidate ID
4. Client optimistically adds candidate row to table with "Scoring..." status
5. Client polls `GET /api/candidates/{id}` every 2 seconds until `score_status = 'complete'`
6. Table row updates with real scores

### Candidate Table (TanStack Table)

- Columns: Rank, Name, Overall Score, Technical Skills, Experience, Role Fit, Communication, Uploaded, Agency
- Sorting: click column header, default sort by `overall_score DESC`
- Filter sidebar (Zustand state, synced to URL query params):
  - Overall score range slider (0-100)
  - Upload date range picker
  - Agency multi-select (populated from DB)
- Pagination: 25 per page, server-side (offset/limit passed to DB query)
- Row click: navigate to `/candidates/{id}`

### Score Dimension Chart

Use `recharts` (lightweight, React-native) for a horizontal bar chart showing 4 dimension scores 0-100 with colour bands (0-40 red, 41-70 amber, 71-100 green).

## External Dependencies (New in Phase 1)

| Package | Purpose | Justification |
|---|---|---|
| `@anthropic-ai/sdk` | Claude API | Primary AI ranking engine |
| `pdf-parse` | PDF text extraction | Lightweight, no cloud dep |
| `mammoth` | DOCX text extraction | Best DOCX-to-text Node.js lib |
| `react-dropzone` | File upload UI | Best-in-class drag-and-drop |
| `recharts` | Score dimension chart | Lightweight, React-native, no config |
| `bcryptjs` | Password hashing | Auth.js credentials provider |
| `@auth/drizzle-adapter` | Auth.js + Drizzle session storage | Official adapter |
| `next-auth@beta` | Auth.js v5 | Self-hosted auth |
| `drizzle-orm` | ORM | Native pgvector, type-safe |
| `drizzle-kit` | Migrations | Drizzle schema management |
| `postgres` | PostgreSQL driver | Works in Next.js edge runtime |
| `pgvector` | pgvector Node.js client | Vector column support |
| `@tanstack/react-table` | Data table | Headless, full sort/filter control |
| `@tanstack/react-query` | Server state | Candidate polling, cache |
| `zustand` | UI state | Filter sidebar state |
| `zod` | Schema validation | AI response + form validation |
| `react-dropzone` | File upload | Drag-and-drop CV upload |

All shadcn/ui components added via `npx shadcn@latest add <component>` CLI — not listed as direct deps.
