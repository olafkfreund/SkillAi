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

## Patterns introduced recently

These patterns are load-bearing across multiple pages — follow them when extending the same surfaces.

- **Audience-based view sanitisation** — pages and shared components accept an `audience: 'recruiter' | 'customer' | 'manager'` prop and strip fields accordingly. Recruiters see everything; customers see no internal notes / rates / margin / agency; managers see score breakdown + reasoning + interview pack but no rates / margin / agency, and edit controls become read-only. Threaded through the role detail and candidate detail pages, plus `RoleCandidateCard`, `EditDetailsForm`, `NotesPanel`, `RoleTagsPanel`, `PriorityKeywordsPanel`. Notes additionally honour `is_shareable=true` for the manager audience. When adding new fields with commercial / internal data, gate them on `audience === 'recruiter'` explicitly — do not default to visible. (PR #95)
- **Logo upload pattern** — agency and customer logos stored at DB path `/uploads/{tenantId}/logos/{uuid}.{ext}` (web-relative, leading slash). The filesystem write path MUST be derived from that same DB path via the storage helper so write and read stay symmetric (regression risk: see issue #98). Allowed MIME types: PNG / JPEG / WebP only. Hard cap 2 MB. Lists render at 32 px, detail headers at 64 px, with an initials avatar fallback when absent. (PR #97)
- **Help-tab content pattern** — in-app docs live as markdown files in `src/content/help/*.md` with YAML front-matter (`title`, `category`, `audience`, `order`, `summary`). `gray-matter` parses; a Zod schema validates each file at load time so a malformed doc fails loudly rather than silently. The loader filters by the current user's role so each persona sees only their relevant articles. To add a new article, drop a file in `src/content/help/` — no code change needed. (PR #96)
- **Theme tokens (light/dark)** — `next-themes` provider + CSS-var token system in `src/app/globals.css`. New components must use the token classes, not hardcoded zinc:
  - `bg-[var(--color-bg-app)]` for page background, `bg-[var(--color-bg-elevated)]` for cards/panels/sidebar, `bg-[var(--color-bg-input)]` for form inputs
  - `text-[var(--color-fg)]` primary, `text-[var(--color-fg-muted)]` secondary, `text-[var(--color-fg-subtle)]` tertiary
  - `border-[var(--color-border)]` for borders
  - Accent colors (`bg-blue-*`, `bg-emerald-*`, `bg-violet-*`, `bg-amber-*`, `bg-red-*`) stay as direct Tailwind — they are theme-invariant
  Migration is incremental: shell + login + sidebar are converted; ~250 components still use hardcoded `bg-zinc-*` / `text-zinc-*` / `border-zinc-*`. When you touch a component for any reason, convert its color classes in the same PR. Wholesale migration tracked in Epic [#103](https://github.com/olafkfreund/SkillAi/issues/103).
- **Agency logo on candidate displays** — small logo + initials fallback rendered alongside candidate identity. Sizing: 20 px on lists and role-detail cards (`selectable-candidate-list.tsx`, `role-candidate-card.tsx`), 24 px on candidate detail headers, 32 px on the candidate PDF. Always set explicit width/height, `object-contain`, rounded-full + `bg-zinc-800` placeholder; initials avatar when `agencyLogoPath` is null. Web surfaces fetch via `/api/agencies/{agencyId}/logo`; PDFs use the base64 data-URI pattern in `src/app/api/export/candidate/[candidateId]/route.ts` (read via `getLogoAbsolutePath`, encode, hand to react-pdf `<Image>`).

## Important Notes

- Product-specific files in `.agent-os/product/` override any global standards
- User's specific instructions override (or amend) instructions found in `.agent-os/specs/`
- Always adhere to established patterns, code style, and best practices documented above
- This is an **internal tool only** — no public-facing auth flows, no email verification complexity needed
- Decisions in `.agent-os/product/decisions.md` have highest override priority
