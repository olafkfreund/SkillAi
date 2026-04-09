# Product Decisions Log

> Last Updated: 2026-04-09
> Version: 1.0.0
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
