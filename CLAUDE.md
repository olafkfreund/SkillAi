# SkillAI — Claude Code Instructions

> Internal AI-powered recruiting portal
> Stack: Next.js 16 + TypeScript + Drizzle ORM + PostgreSQL 17 + pgvector + Claude + Docker

## Agent OS Documentation

### Product Context
- **Mission & Vision:** @.agent-os/product/mission.md
- **Technical Architecture:** @.agent-os/product/tech-stack.md
- **Development Roadmap:** @.agent-os/product/roadmap.md
- **Decision History:** @.agent-os/product/decisions.md

### Development Standards
- **Code Style:** @~/.agent-os/standards/code-style.md
- **Best Practices:** @~/.agent-os/standards/best-practices.md

### Project Management
- **Active Specs:** @.agent-os/specs/
- **Spec Planning:** Use `@~/.agent-os/instructions/create-spec.md`
- **Tasks Execution:** Use `@~/.agent-os/instructions/execute-tasks.md`

## Workflow Instructions

When asked to work on this codebase:

1. **First**, check @.agent-os/product/roadmap.md for current priorities
2. **Then**, follow the appropriate instruction file:
   - For new features: @~/.agent-os/instructions/create-spec.md
   - For tasks execution: @~/.agent-os/instructions/execute-tasks.md
3. **Always**, adhere to the standards in the files listed above

## Key Architecture Rules

- **Multi-tenancy:** Every DB table has `tenant_id UUID NOT NULL`. RLS enforced via `SET app.tenant_id` at request start. Never query without tenant context.
- **AI scoring:** Use Claude structured outputs — response must always match the `CandidateScore` Zod schema. Never parse unstructured AI text for scores.
- **File uploads:** CVs stored in `/app/uploads` volume. Parse with `pdf-parse` (PDF) or `mammoth` (DOCX). Never store raw binary in DB.
- **Auth:** Auth.js v5 with JWT. Tenant ID embedded in JWT. Role checked at middleware level before any route handler runs.
- **ORM:** Drizzle only. No raw SQL except for RLS session variable setting. Schema in `src/db/schema/`.
- **pgvector:** Embeddings stored in `candidates.embedding` (vector(1536)). Use HNSW index. Cosine similarity for search.

## Important Notes

- Product-specific files in `.agent-os/product/` override any global standards
- User's specific instructions override (or amend) instructions found in `.agent-os/specs/`
- Always adhere to established patterns, code style, and best practices documented above
- This is an **internal tool only** — no public-facing auth flows, no email verification complexity needed
- Decisions in `.agent-os/product/decisions.md` have highest override priority
