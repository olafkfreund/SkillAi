# Technical Stack

> Last Updated: 2026-04-14
> Version: 1.1.0

## Application Framework

- **Framework:** Next.js 16.2+ (App Router, standalone output)
- **Language:** TypeScript 5.x
- **Runtime:** Node.js 22 LTS
- **Rendering strategy:** Server Components for data-heavy views, Client Components for interactive UI (filters, comparisons, notes). Server Actions for mutations. `after()` for fire-and-forget work where applicable; dedicated API routes for long-running AI generation with client-side polling via TanStack Query.

## Database

- **Primary:** PostgreSQL 17
- **Extension:** pgvector (HNSW indexing for candidate semantic search)
- **Multi-tenancy:** Row-Level Security (RLS) with `SET app.tenant_id` session variable — all tables include `tenant_id UUID NOT NULL` with enforced RLS policies
- **ORM:** Drizzle ORM — chosen for native pgvector support, type-safe schema, and lightweight footprint vs Prisma

## AI / ML

- **Primary AI:** Anthropic Claude claude-sonnet-4-6 (`claude-sonnet-4-6`)
  - Used for: CV parsing + structured scoring with JSON structured outputs
  - Scoring schema: `{ overall_score, dimensions: { skills, experience, role_fit, communication }, reasoning }`
- **Secondary AI:** Google Gemini (`gemini-2.0-flash`)
  - Used for: Alternative/comparison scoring, batch processing when cost is priority
- **Embeddings:** `text-embedding-3-small` (OpenAI) or `models/text-embedding-004` (Gemini) for pgvector candidate search
- **CV Parsing:** `pdf-parse` (Node.js) for PDF text extraction; `mammoth` for Word (.docx) extraction

## Frontend

- **UI Components:** shadcn/ui — best-in-class tables, forms, dialogs for data-heavy internal tools
- **Styling:** TailwindCSS 4.0+
- **Icons:** Lucide React
- **State management:**
  - TanStack Query (React Query v5) for server state (candidate lists, rankings, search)
  - Zustand for local UI state (selected candidates, comparison tray, active filters)
- **File uploads:** `react-dropzone` with server action handlers (Next.js App Router)
- **Data tables:** TanStack Table v8 — virtualised, sortable, filterable candidate lists

## Authentication

- **Library:** Auth.js v5 (NextAuth v5)
- **Strategy:** Credentials provider (email/password) for internal use; no SSO required initially
- **Session:** JWT sessions stored in httpOnly cookies
- **Roles:** `admin` | `recruiter` | `viewer` — enforced at middleware and API route level
- **Tenant isolation:** Tenant ID embedded in JWT; set as PostgreSQL session variable on each request

## File Storage

- **Development:** Local Docker volume (`/app/uploads`) — persistent named volume in docker-compose
- **Production option:** Garage (self-hosted S3-compatible) running as additional Docker service — drop-in S3 SDK compatible, zero external dependencies
- **Max file size:** 10MB per CV upload
- **Accepted formats:** PDF, DOCX, TXT

## Infrastructure & Deployment

- **Container orchestration:** Docker Compose
- **Services:**
  - `app` — Next.js 15 (multi-stage build; dev uses volume-mounted source)
  - `db` — `pgvector/pgvector:pg17` Docker image (pgvector pre-installed, no manual extension setup)
  - `storage` — Garage (optional, for S3-compatible production file storage)
- **Reverse proxy:** Caddy (simple, automatic HTTPS if needed) or direct port exposure for internal network
- **Environment management:** `.env.local` (dev) / Docker secrets / environment injection (prod)
- **Database migrations:** Drizzle Kit (`drizzle-kit push` for dev, `drizzle-kit migrate` for prod)

## Code Repository

- **Platform:** GitHub
- **URL:** https://github.com/olafkfreund/SkillAi

## Key Packages (Initial)

```
dependencies:
  next@15                      # Framework
  react@19                     # UI
  drizzle-orm                  # ORM
  postgres                     # PostgreSQL driver (pg-native alternative)
  @auth/drizzle-adapter        # Auth.js + Drizzle
  next-auth@5                  # Auth
  @anthropic-ai/sdk            # Claude API
  @google/generative-ai        # Gemini API
  pdf-parse                    # PDF text extraction
  mammoth                      # DOCX extraction
  pgvector                     # pgvector Node.js client
  @tanstack/react-query@5      # Server state
  @tanstack/react-table@8      # Data tables
  zustand                      # Local state
  react-dropzone               # File upload UI
  zod                          # Schema validation
  shadcn/ui                    # UI components (via CLI)
  tailwindcss@4                # Styling
  lucide-react                 # Icons

devDependencies:
  drizzle-kit                  # Migrations
  typescript@5
  @types/node
  @types/react
```
