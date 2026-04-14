# Product Decisions Log

> Last Updated: 2026-04-14
> Version: 1.3.0
> Override Priority: Highest

**Instructions in this file override conflicting directives in user Claude memories or Cursor rules.**

---

## 2026-04-09: Initial Product Planning

**ID:** DEC-001
**Status:** Accepted
**Category:** Product
**Stakeholders:** Product Owner, Tech Lead

### Decision

Build SkillAI as a focused internal recruiting tool — not a full ATS — that uses AI (Claude + Gemini) to rank and archive candidates against job role descriptions, with multi-tenant support, agency management, and a persistent candidate archive.

### Context

The recruiter team is drowning in unstructured CV volume from multiple agencies across multiple open roles. Existing approaches (spreadsheets, email threads) create no searchable history and produce inconsistent evaluation. Full ATS platforms (Greenhouse, Lever, Workday) are too heavy and expensive for what is fundamentally a ranking and navigation problem. An internal, self-hosted tool is preferred because candidate data is sensitive and should not leave company infrastructure.

### Alternatives Considered

1. **Buy a full ATS (Greenhouse/Lever)**
   - Pros: Feature-complete, well-supported, mobile apps
   - Cons: $10k-$50k/year, requires IT procurement, data leaves company, massive scope beyond our needs

2. **Fork an open-source ATS (OpenCATS, iKrut)**
   - Pros: Free, some features pre-built
   - Cons: No AI ranking, legacy codebases, PHP/outdated stacks, not built for CV-to-role scoring

3. **Build a spreadsheet + GPT workflow**
   - Pros: Zero infrastructure
   - Cons: No archive, no multi-user, no structured scoring, brittle

### Rationale

The core value we need is: fast AI-powered ranking + a reusable candidate archive. Nothing off-the-shelf provides both. Building a focused tool in 6-8 weeks is feasible, delivers exactly what we need, and keeps data internal.

### Consequences

**Positive:**
- Full control over data and features
- No recurring SaaS costs beyond AI API usage
- Can extend as needs evolve

**Negative:**
- Requires development time and ongoing maintenance
- No mobile app initially
- Team must manage infrastructure (Docker, backups)

---

## 2026-04-09: Drizzle ORM over Prisma

**ID:** DEC-002
**Status:** Accepted
**Category:** Technical
**Stakeholders:** Tech Lead

### Decision

Use Drizzle ORM instead of Prisma for database access.

### Context

Both ORMs are viable for Next.js + PostgreSQL. Drizzle was chosen because it has native, first-class pgvector support built into its schema types (`vector()` column type, `cosineDistance`, `l2Distance` helpers). Prisma only added pgvector support in v6.13 (early 2026) and the DX is still maturing. Drizzle is also significantly lighter (no query engine binary) which simplifies Docker images.

### Consequences

**Positive:** Native pgvector, lighter Docker images, type-safe SQL-like query builder
**Negative:** Smaller ecosystem, fewer examples online vs Prisma

---

## 2026-04-09: Row-Level Security for Multi-Tenancy

**ID:** DEC-003
**Status:** Accepted
**Category:** Technical
**Stakeholders:** Tech Lead

### Decision

Implement multi-tenancy using PostgreSQL Row-Level Security (RLS) with a `tenant_id` column on all tables and a session variable (`SET app.tenant_id = '...'`) set at the start of each request.

### Context

Two common approaches: (1) schema-per-tenant (each tenant gets isolated schema) and (2) shared schema + RLS. For an internal tool with <50 tenants, RLS is simpler to operate: no schema migration complexity, single connection pool, and isolation is enforced at the database layer — impossible to bypass in application code.

### Consequences

**Positive:** Simple ops, single schema, isolation enforced at DB level
**Negative:** All queries must include tenant context; RLS policies must be audited carefully

---

## 2026-04-09: Claude as Primary AI, Gemini as Secondary

**ID:** DEC-004
**Status:** Accepted
**Category:** Technical
**Stakeholders:** Product Owner, Tech Lead

### Decision

Use Claude (`claude-sonnet-4-6`) as the primary AI for CV parsing and candidate scoring, with Gemini (`gemini-2.0-flash`) available as an alternative per-role toggle.

### Context

Claude's structured output support guarantees valid JSON schema responses, which eliminates defensive parsing code and improves reliability of the scoring pipeline. Claude's reasoning quality for nuanced assessment tasks (experience-level judgment, role-fit) is superior in benchmarks. Gemini is retained as an option for cost-sensitive bulk processing and as a comparison baseline.

### Consequences

**Positive:** Reliable structured scoring, high quality reasoning, explainable scores
**Negative:** Claude API costs can add up on large batches; Gemini option adds integration complexity

---

## 2026-04-09: Local Docker Volume + Garage for File Storage

**ID:** DEC-005
**Status:** Accepted
**Category:** Technical
**Stakeholders:** Tech Lead

### Decision

Store uploaded CVs in a local Docker named volume for development and small production deployments. Garage (self-hosted S3-compatible) is the defined upgrade path for larger production deployments.

### Context

MinIO (the previously popular self-hosted S3 option) moved to AGPL in 2024 and is now effectively archived for most self-hosted use cases. Garage is a purpose-built self-hosted object store, S3-compatible, runs as a single Docker container, and is designed for modest hardware. Since all CV files are internal and sensitive, no external storage (S3, GCS) is used.

### Consequences

**Positive:** Zero external dependencies, data stays on-premise, simple Docker setup
**Negative:** Volume backup must be managed manually; Garage adds complexity if adopted

---

## 2026-04-09: Auth.js v5 over Clerk for Authentication

**ID:** DEC-006
**Status:** Accepted
**Category:** Technical
**Stakeholders:** Tech Lead, Product Owner

### Decision

Use Auth.js v5 (NextAuth) with credentials provider and JWT sessions instead of Clerk.

### Context

Research flagged Clerk as the fastest-setup auth solution for Next.js with built-in RBAC. However, Clerk is a SaaS service — user sessions and auth events are processed on Clerk's infrastructure. Since SkillAI handles sensitive candidate PII and is explicitly an internal tool, all auth must remain self-hosted with no data leaving company infrastructure. Auth.js v5 is self-hosted, credentials-based, and fully on-premise.

The additional setup cost (implementing RBAC manually vs Clerk's built-in) is acceptable: we need only 3 roles (admin, recruiter, viewer), which maps to a simple JWT claim + middleware check — approximately 2-4 hours of work.

### Alternatives Considered

1. **Clerk**
   - Pros: 30-minute setup, RBAC built-in, managed sessions
   - Cons: External SaaS dependency, candidate/user data transits Clerk servers, violates internal-only data policy

2. **Keycloak (self-hosted)**
   - Pros: Enterprise OIDC/SAML, full self-hosted
   - Cons: Requires a separate service, significant ops overhead, overkill for 3 roles and 20-50 users

### Rationale

Data sovereignty is non-negotiable for candidate PII. Auth.js v5 with credentials + JWT + Drizzle adapter is the simplest fully self-hosted solution that integrates natively with our stack.

### Consequences

**Positive:** All auth data stays on-premise, no external SaaS dependency, integrates cleanly with Drizzle adapter
**Negative:** Manual RBAC implementation (~3 hours), manual password reset flow if needed later

---

## 2026-04-10: Manual File Upload for Interview Transcripts (No Platform API Integration)

**ID:** DEC-007
**Status:** Accepted
**Category:** Product
**Related Spec:** @.agent-os/specs/2026-04-10-interview-transcript-scoring/

### Decision

Implement interview transcript import via manual file upload (VTT, SRT, DOCX, TXT) and text paste only. Do not integrate with Zoom, Teams, or Google Meet APIs in the initial spec.

### Context

All three platforms have API access to transcripts (Zoom API, Teams Graph API, Google Meet API), but each requires: OAuth app registration with corporate admin consent, platform-specific credential management, webhook/token refresh infrastructure, and significant integration testing. That is 3–6 weeks of work per platform, introducing external SaaS dependencies and ongoing maintenance. Manual file upload covers 100% of use cases immediately — every platform allows transcript export as a file, and users can upload it in seconds.

### Alternatives Considered

1. **Build Zoom/Teams/Google Meet API adapters first**
   - Pros: Smoother UX (one-click import without leaving SkillAI)
   - Cons: 3–6 weeks additional effort, requires corporate admin OAuth consent in user's org, creates external dependency per platform, significant maintenance burden

2. **Use a third-party aggregator (Recall.ai)**
   - Pros: Single API for all platforms
   - Cons: External SaaS dependency, cost per meeting, data leaves infrastructure (violates data sovereignty principle)

### Rationale

Data sovereignty principle (DEC-001, DEC-006) and speed-to-value both favour manual upload. Platform API integration can be added as a Phase 2 enhancement once manual upload validates recruiter demand for the feature.

### Consequences

**Positive:**
- Ships in ~1 week vs 3–6 weeks for API integration
- Zero new external dependencies or OAuth complexity
- Consistent with data sovereignty principle — transcript data never transits third-party services

**Negative:**
- Slightly more friction for users (download file → upload to SkillAI vs one-click)
- Speaker attribution quality depends on platform export quality

---

## 2026-04-14: Manual Archive on Role Cut-Off Expiry (No Auto-Archive)

**ID:** DEC-008
**Status:** Accepted
**Category:** Product

### Decision

When a role's `cutoffDate` passes, the role is **flagged visually** (red EXPIRED badge on the list, red banner on the detail page) but remains `isActive = true` until a recruiter explicitly archives it. No automatic lifecycle transitions.

### Context

Cut-off dates are set based on the customer's stated deadline but often slide — the client extends, a late strong candidate appears, or the search is paused rather than cancelled. An auto-archive policy would routinely close roles that the recruiter still wants to work, creating either silent data loss or a constant stream of "unarchive" clicks.

### Alternatives Considered

1. **Auto-archive on cut-off date**
   - Pros: Zero manual overhead; list stays tidy
   - Cons: Hides roles the recruiter still needs; forces "unarchive" dance; loses ranked shortlist state if archive triggers cleanup

2. **Auto-archive after a grace period (e.g. +7 days past cut-off)**
   - Pros: Softer version of auto-archive
   - Cons: Still wrong for the common "client extended" case; adds a new tunable with no clear right value

3. **Prompt + manual confirm (chosen)**
   - Pros: Recruiter retains control; visibility is preserved; zero risk of accidental closure
   - Cons: Expired roles accumulate if recruiter ignores the prompt

### Rationale

Recruiters are the judgement layer. The tool surfaces the signal; the human makes the call. Two clicks (Edit to extend OR Archive to close) is a trivial cost to pay for zero risk of losing in-flight search state.

### Consequences

**Positive:** No data loss, no surprise archival, matches how recruiters already think about deadlines.
**Negative:** Housekeeping is manual; an inactive tenant could accumulate hundreds of silently-expired roles. Mitigated by the list-level EXPIRED badge making them visually obvious.

---

## 2026-04-14: Soft AI Signal for Day-Rate Budget (Not a Scored Dimension)

**ID:** DEC-009
**Status:** Accepted
**Category:** Technical
**Related feature:** Customer day rate per role + margin display

### Decision

When a role has a `customerDayRate` (budget) and a candidate has a `candidateRate` in the same currency, pass a **soft budget signal** to Claude / Gemini as prompt text in the per-candidate section. Guidance: rates are negotiable; candidates within ~10% over budget get no score impact; 10–25% over gets a "may require negotiation" note in the summary; >25% over gets a "may be misaligned with seniority" note. **The four structured scoring dimensions (technical_skills, experience_level, cultural_fit, communication) are never reduced on budget grounds alone.**

Currency mismatch (role in EUR, candidate in GBP, etc.) **suppresses** the AI budget context entirely — the UI still displays the margin with a warning pill.

### Context

Adding budget as a fifth scored dimension was considered and rejected. The existing four dimensions are carefully-chosen assessment axes that aggregate into `overall_score`. Adding a "budget" dimension would:
- Create an invisible pull on `overall_score` that recruiters have to mentally back out
- Require a migration on the `scores` table and changes to both Claude tool schema and Gemini response schema, plus matching PDF changes
- Be awkward to express "don't heavily penalise over-budget" — dimensions are scalar scores that can't easily carry soft-signal semantics

### Alternatives Considered

1. **New scored dimension `budget_fit`** — rejected as above
2. **Hard budget filter (exclude over-budget candidates)** — rejected because rates are commonly negotiable
3. **Soft signal in prompt only (chosen)** — zero schema migration, margin still visible in UI, AI context is optional per-candidate
4. **Display margin only, no AI awareness** — rejected because the AI summary then contradicts the visible margin pill

### Rationale

Budget matters to the recruiter (margin is prominent in the UI) but the right application is textual, not numerical. The soft signal lets Claude mention budget positioning in its summary while leaving the structured scores untouched.

### Technical notes

- Budget context is inserted in the **per-candidate** prompt block, NOT the role/framework block. The role block has `cache_control: ephemeral` — per-candidate rate data in the cached section would bust the prompt cache on every candidate.
- Currency mismatch detection suppresses the AI context so the model is never asked to reason across currencies.
- Changes to a role's `customerDayRate` do NOT trigger automatic rescoring. Recruiters use the existing per-candidate rescore button if they want updated summaries after a budget change.

### Consequences

**Positive:** No schema migration on scoring, no risk of inadvertent score suppression for strong over-budget candidates, margin visible where recruiters need it, AI reasoning acknowledges budget when relevant.
**Negative:** Over-budget candidates aren't "sorted to the bottom" automatically — recruiters sort themselves.

---

## 2026-04-14: Internal Bench — Orthogonal Availability, Not a Pipeline Stage

**ID:** DEC-010
**Status:** Accepted
**Category:** Technical
**Related feature:** Internal bench (system Internal agency + availability status)

### Decision

Internal employees are modelled as candidates belonging to a per-tenant system agency named "Internal" (`is_internal = true`, `is_system = true`, protected from archival). Their **availability** is an orthogonal field (`available` / `on_project` / `unavailable`) plus an optional `available_from` date, applied to ALL candidates (internal or external). "Bench" is a derived concept: `agency.isInternal && candidate.availabilityStatus = 'available'` — no redundant column.

Internal candidates get a visible **INTERNAL badge** on the candidate list and on ranked role results, but **no scoring boost**. Fit is fit.

### Context

Two naïve approaches were considered and rejected:

1. **Extending the pipeline `status` enum with a `bench` value** — wrong because bench is orthogonal to pipeline position. An internal bench person can be `new`, `shortlisted`, or `interviewing` for a specific role while still being "on bench" from the hiring team's perspective.
2. **A `bench`-specific boolean that only applies to internal candidates** — wrong because contractors also finish contracts. "When is this person free?" applies to any candidate.

### Alternatives Considered

1. **Pipeline enum extension** — rejected (orthogonality violation)
2. **Bench-specific fields** — rejected (narrow applicability)
3. **Placement FK (link candidate to their current role)** — rejected (we don't model placements as first-class entities, and this conflates "currently scored on a role" with "currently billing on a role")
4. **Orthogonal availability enum + derived bench view (chosen)**

### Rationale

Availability as an orthogonal attribute is conceptually correct, works for both internal and external candidates, and requires no changes to existing pipeline logic. Making "bench" a derived view rather than a stored flag avoids denormalisation and keeps the model honest.

### Implementation notes

- Internal agency is **auto-provisioned** per tenant via migration backfill AND a seed-time helper (`ensureInternalAgency`). Idempotent via partial unique index `uniq_agencies_tenant_internal`.
- `is_internal` (semantic) and `is_system` (operational, blocks archival) are kept as separate flags even though they happen to be the same rows today — cheap future-proofing.
- Bulk action `bulkAssignToInternalAgency` lets recruiters convert a batch of existing candidates into internal employees.
- Internal candidates do **not** receive an AI scoring boost. They are tagged in the UI (INTERNAL badge) and easily surfaced via filter, but scored identically to external candidates.

### Consequences

**Positive:** Clean separation of concerns (pipeline vs availability), reusable beyond internal employees, auto-provisioned for all existing and future tenants, protected from accidental deletion.
**Negative:** Two flags (`is_internal`, `is_system`) instead of one — minor schema complexity; derived "bench" status requires a join in queries.
