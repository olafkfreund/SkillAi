# SkillAI

_Internal AI-powered recruiting portal — rank candidates in seconds, archive them forever, integrate with Claude._

<div class="section-label">$ skillai --version 1.0</div>

## What you get


### Sub-second ranking

Upload a job role, paste CVs, get a ranked shortlist scored across four
dimensions (skills, experience, role-fit, communication) with explainable AI
reasoning. Powered by **Claude claude-sonnet-4-6** with **Gemini 2.0 Flash** as
fallback.


### Reusable candidate archive

Every candidate persists with their AI-extracted profile and full scoring
history. Re-rank past candidates against new roles in one click. Semantic
search via **pgvector** (HNSW + cosine similarity).


### Multi-tenant by default

Postgres **Row-Level Security** isolation enforced at the database layer.
Tenant ID is set via `SET app.tenant_id` on every request — impossible to
bypass from application code.


### MCP-native

Built-in **Model Context Protocol** server at `/api/mcp` exposes 48 tools,
4 resources, and 3 prompts. Connect Claude Code or claude-desktop and drive
the whole portal from your terminal.


### GDPR-ready

Right-to-erasure (Article 17) with audit-log redaction, DSAR export
(Article 15) as a streamed ZIP, per-tenant audit retention. See
[DEC-011](./decisions/dec-011-gdpr-erasure.md).


### Self-hosted, no external SaaS

Postgres + pgvector + Docker — that's the stack. No data leaves your
infrastructure. Claude/Gemini API keys are per-tenant and stored encrypted.

## Start where you are


### 🚀 Try it locally

`docker compose up` and you're running in five minutes. See
[Quick start](./getting-started/quick-start.md).


### 🔌 Integrate via REST

77 routes, 41 documented in the OpenAPI spec. Bearer-token auth,
sliding-window rate limits, scope-based authorization. Start at
[REST API overview](./rest-api/overview.md).


### 🤖 Drive it from Claude

The MCP server lets Claude Code create roles, score candidates, send
interview packs, and approve shortlists end-to-end. See
[Connecting from Claude Code](./mcp-server/connecting.md).


### 🏛️ Read the decisions

Why Drizzle over Prisma. Why RLS over schema-per-tenant. Why manual
transcript upload over Zoom OAuth. All 11 decisions are
[logged with rationale](./decisions/index.md).

## The numbers

|  |  |
|--|--|
| **REST routes** | 77 (41 in OpenAPI, 36 internal/UI/auth) |
| **MCP tools** | 48 across 12 modules (27 read · 21 write) |
| **MCP resources** | 4 URI-addressable views |
| **MCP prompts** | 3 prebuilt multi-step workflows |
| **DB tables** | 29 tenant-scoped tables under RLS |
| **Design decisions** | 11 logged with full rationale |
| **In-app help articles** | 20+ across 8 categories (recruiter-facing) |

## Quick links

- [What is SkillAI](./overview/what-is-skillai.md) — the elevator pitch and the problem space
- [Product tour](./overview/product-tour.md) — annotated screenshots of every major surface
- [System overview](./architecture/system-overview.md) — boxes-and-arrows, request lifecycle, AI pipeline
- [Endpoint reference](./rest-api/endpoints.md) — auto-generated from the OpenAPI spec
- [Tool catalogue](./mcp-server/tools.md) — auto-generated from the MCP registry
- [Roadmap](./roadmap.md) — what shipped, what's next
