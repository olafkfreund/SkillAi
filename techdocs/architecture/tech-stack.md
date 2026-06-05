# Tech stack

_Every chosen library with its version and a one-sentence rationale._

Canonical source is `.agent-os/product/tech-stack.md` in the repo. This page is the documentation-site version of the same list.

> **ℹ️ Note**
>
> For *why* a given technology was chosen over the obvious alternative, see the [design decisions](../decisions/index.md) — each major pick has its own decision record (Drizzle over Prisma, RLS over schema-per-tenant, Auth.js over Clerk, etc.).

## Application framework

| Item | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.2+** (App Router, standalone output) | Server Components + Server Actions + `after()` cover pages, mutations, and background work without a separate API tier. |
| Language | **TypeScript 5.x**, strict mode | No `any` except where the third-party SDK forces it. |
| Runtime | **Node.js 22 LTS** | Matches the `node:22-alpine` image used in Docker. |
| Rendering | Server Components for data-heavy views; Client Components for interactive UI; Server Actions for mutations | One framework, one execution model. |

## Database

| Item | Choice | Why |
|---|---|---|
| Engine | **PostgreSQL 17** | Latest stable; same image used in dev and prod. |
| Extension | **pgvector** (HNSW indexing) | Native vector type + cosine distance for candidate semantic search — no separate vector store. |
| Multi-tenancy | **Row-Level Security** with `SET app.tenant_id` per request | Isolation enforced at the DB layer; see [DEC-003](../decisions/dec-003-row-level-security.md). |
| ORM | **Drizzle ORM** | First-class pgvector support, type-safe SQL-like query builder, no query-engine binary; see [DEC-002](../decisions/dec-002-drizzle-over-prisma.md). |

## AI / ML

**What we picked**

| Item | Choice |
|---|---|
| Primary scoring | **Anthropic Claude** (`claude-sonnet-4-6`) with tool-use structured outputs |
| Secondary scoring | **Google Gemini** (`gemini-2.0-flash`) with `responseSchema` JSON mode |
| Embeddings | **Gemini `models/gemini-embedding-001`** (768 dimensions) |
| CV parsing | **`pdf-parse`** (PDF) + **`mammoth`** (DOCX); plus ODT/RTF/TXT/MD parsers |
| Scoring schema | `CandidateScoreSchema` in `src/lib/ai/schema.ts` — Zod-validated, identical shape for both providers |

**What we considered**

- **OpenAI GPT-4 for scoring** — comparable quality, but Claude's structured outputs (tool_use) gave a stronger contract than JSON-mode at the time of the decision. See [DEC-004](../decisions/dec-004-claude-primary.md).
- **OpenAI `text-embedding-3-small`** for embeddings — viable, but the Gemini embedding model is already in the stack for scoring keys and is cheap enough that adding a second provider for embeddings wasn't worth it.
- **A vendor LLM gateway** (LangChain, LiteLLM) — rejected; the two-provider abstraction in `src/lib/ai/scoring.ts` is ~30 lines and zero dependencies.

## Frontend

| Item | Choice | Why |
|---|---|---|
| UI components | **shadcn/ui** | Best-in-class tables, forms, dialogs for data-heavy internal tools. |
| Styling | **TailwindCSS 4.0+** | CSS-var token system lives in `src/app/globals.css` for light/dark theme. |
| Icons | **Lucide React** | Tree-shakable, consistent. |
| Server state | **TanStack Query v5** | Polling for AI generation progress; cache invalidation for lists. |
| Local UI state | **Zustand** | Selected candidates, comparison tray, active filters. |
| File uploads | **`react-dropzone`** + Server Action handlers | Native FormData handling, no extra API surface. |
| Data tables | **TanStack Table v8** | Virtualised, sortable, filterable candidate lists. |

## Authentication

| Item | Choice | Why |
|---|---|---|
| Library | **Auth.js v5 (NextAuth v5)** | Self-hosted; no candidate or session data leaves the host. See [DEC-006](../decisions/dec-006-authjs-over-clerk.md). |
| Strategy | Credentials provider (email + password) | Internal tool; no SSO requirement in v1. |
| Session | **JWT** in httpOnly cookies | Tenant ID + role embedded in the token. |
| Roles | `admin` &gt; `recruiter` &gt; `hiring_manager` &gt; `viewer` | Ranked so `requireRole(_, 'recruiter')` blocks managers without call-site changes. |
| API auth | Bearer tokens (`skl_<env>_<24-base62>`), argon2-hashed | Per-token scope (`read` / `write` / `admin`) enforced by `withApiAuth`. |

## File storage

| Item | Choice | Why |
|---|---|---|
| Dev / small prod | **Local Docker volume** at `/app/uploads` | Zero dependencies; data stays on the host. See [DEC-005](../decisions/dec-005-storage.md). |
| Larger prod | **Garage** (self-hosted S3-compatible) | Drop-in S3 SDK compatibility; no public cloud dependency. |
| Max CV size | **10 MB** per file (PDF/DOCX/ODT/TXT/RTF/MD) | Enforced in `src/lib/cv/store.ts:18`. |
| Max logo size | **2 MB** (PNG/JPEG/WebP only — no SVG) | Enforced in `src/lib/branding/store.ts:16`. SVG rejected for XSS surface. |

Full layout, path-traversal guards, and the symmetric DB-path/disk-path resolution pattern live in [File storage](./file-storage.md).

## Infrastructure & deployment

| Item | Choice | Why |
|---|---|---|
| Orchestration | **Docker Compose** for dev/single-host; **AWS EKS** for cloud | Same Dockerfile in both. See [AWS deployment](../operations/aws-deploy.md). |
| App image | `node:22-alpine` (multi-arch — arm64 on Graviton) | Small surface, fast cold start. |
| DB image | **`pgvector/pgvector:pg17`** | pgvector pre-installed; no manual extension setup. |
| Reverse proxy | **Caddy** (single-host with automatic HTTPS) or **NGINX Ingress + cert-manager** (Kubernetes) | Operator choice. |
| Migrations | **Drizzle Kit** — `db:push` for dev, `db:migrate` for prod | Migrations live in `src/db/migrations/`. |
| CI/CD | **GitHub Actions** | Build + push to ECR; `kubectl apply -k` for the rolling deploy. |

## Code repository

- **Platform:** GitHub
- **URL:** [github.com/olafkfreund/SkillAi](https://github.com/olafkfreund/SkillAi)
- **Main branch:** `core-mvp-foundation`
- **Branching:** every PR branches off `core-mvp-foundation` explicitly
