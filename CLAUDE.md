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

## Project Structure

- `/src/` - Next.js App Router, UI components, API routes, and Drizzle ORM schema (in `/src/db/`).
- `/docs/` - Product documentation, screenshots, MCP tools list, and setup guides.
- `/skillai-mcp/` - Standalone MCP stdio bridge allowing Claude Desktop to connect to the `/api/mcp` endpoint over HTTPS.
- `/tests/` - Vitest test suite.
- `/public/` - Static assets.
- `/uploads/` - Local storage volume for uploaded CVs and tenant logos.
- `/docker/` - Docker compose definitions and scripts.
- `/scripts/` - Assorted helper and development scripts.

## Claude MCP Integration Steps

SkillAI runs an internal MCP server accessible directly over HTTP or via a stdio bridge (`skillai-mcp`). To integrate with Claude Code:

1. Mint a token in the SkillAI web UI at `/settings/api-tokens`.
2. Connect Claude Code directly to the HTTP endpoint using the `claude` CLI:
   ```bash path=null start=null
   claude mcp add --transport http --scope user skillai \
     http://localhost:3000/api/mcp \
     --header "Authorization: Bearer skl_prod_your_token_here"
   ```
3. Alternatively, to use the stdio bridge via the `skillai-mcp` binary:
   ```bash path=null start=null
   claude mcp add --transport stdio --scope user skillai skillai-mcp \
     -e SKILLAI_URL=http://localhost:3000 \
     -e SKILLAI_TOKEN=skl_prod_your_token_here
   ```

For `claude-desktop`, add the configuration to `claude_desktop_config.json` specifying the `skillai-mcp` command and passing the `SKILLAI_URL` and `SKILLAI_TOKEN` in the env block.

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
- **Theme tokens (light/dark)** — `next-themes` provider + CSS-var token system in `src/app/globals.css`. All components use the token classes:
  - `bg-[var(--color-bg-app)]` for page background, `bg-[var(--color-bg-elevated)]` for cards/panels/sidebar, `bg-[var(--color-bg-input)]` for form inputs
  - `text-[var(--color-fg)]` primary, `text-[var(--color-fg-muted)]` secondary, `text-[var(--color-fg-subtle)]` tertiary
  - `border-[var(--color-border)]` for borders
  - Saturated accent colors (`bg-blue-600`, `bg-emerald-700`, `bg-violet-600`, `bg-amber-*`, `bg-red-600`) stay as direct Tailwind — theme-invariant solid action buttons
  - Status pills use the `dark:` prefix pattern: `bg-X-100 dark:bg-X-950 text-X-700 dark:text-X-300 border-X-300 dark:border-X-800` so they read in both modes
  Full migration completed in Epic #103 (PRs #161–#165). Never reintroduce hardcoded `bg-zinc-{700,800,900,950}` / `text-zinc-{100,300,400,500,600}` / `border-zinc-{600,700,800}` for surfaces — use the tokens.
- **`next build` prerender constraint** — Next 16.2 + React 19 has a known `useContext null` failure when statically prerendering any route whose layout transitively renders a client component using React context at module scope (e.g. `<ThemeProvider>` from `next-themes`). The build is kept green via `export const dynamic = 'force-dynamic'` on `src/app/page.tsx` and `src/app/(dashboard)/layout.tsx`. **When adding a new public route under `src/app/`, default to `export const dynamic = 'force-dynamic'`** unless the route is a dynamic segment (`[token]`-style) with no static params — those don't trigger prerender. Tracked + closed-by-workaround in #41; revisit when Next ships an upstream fix.
- **Agency logo on candidate displays** — small logo + initials fallback rendered alongside candidate identity. Sizing: 20 px on lists and role-detail cards (`selectable-candidate-list.tsx`, `role-candidate-card.tsx`), 24 px on candidate detail headers, 32 px on the candidate PDF. Always set explicit width/height, `object-contain`, rounded-full + `bg-zinc-800` placeholder; initials avatar when `agencyLogoPath` is null. Web surfaces fetch via `/api/agencies/{agencyId}/logo`; PDFs use the base64 data-URI pattern in `src/app/api/export/candidate/[candidateId]/route.ts` (read via `getLogoAbsolutePath`, encode, hand to react-pdf `<Image>`).

## Important Notes

- Product-specific files in `.agent-os/product/` override any global standards
- User's specific instructions override (or amend) instructions found in `.agent-os/specs/`
- Always adhere to established patterns, code style, and best practices documented above
- This is an **internal tool only** — no public-facing auth flows, no email verification complexity needed
- Decisions in `.agent-os/product/decisions.md` have highest override priority
