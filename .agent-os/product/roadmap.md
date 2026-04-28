# Product Roadmap

> Last Updated: 2026-04-28
> Version: 2.3.0
> Status: Phases 1–4 shipped; Phase 5 partial; Hiring Manager persona shipped (Epic #73); in-app help, branding logos, candidate-list cleanup, and light/dark mode v1 shipped; further integrations tracked on GitHub

## Phase 1: Foundation & Core MVP ✅ SHIPPED

**Goal:** Working Docker app where a recruiter can upload CVs, create a job role, and get AI rankings
**Success Criteria:** End-to-end flow from CV upload → AI score → ranked list visible in UI

### Must-Have Features

- [x] Project scaffold — Next.js 16 + TypeScript + Drizzle + PostgreSQL + Docker Compose
- [x] Database schema — tenants, users, candidates, roles, scores, agencies, notes
- [x] Auth — Auth.js v5 with credentials, JWT, role-based middleware
- [x] CV upload — drag-and-drop upload, PDF/DOCX parsing, text extraction
- [x] Candidate record creation — store parsed CV text + metadata in DB
- [x] Job role creation — form to create/store role description with requirements
- [x] AI ranking engine — Claude structured output scoring per dimension
- [x] Ranked candidate list UI — sortable cards with overall score + dimension scores
- [x] Single candidate profile view — full CV text, scores, AI reasoning
- [x] Interview question + code test generator — AI-generated personalised question pack per candidate+role
- [x] Settings panel — per-tenant API key management (Claude + Gemini keys stored encrypted)
- [x] Extended CV file format support — PDF, DOCX, ODT, TXT, RTF, MD upload and parsing
- [x] PDF export — candidate pack, role brief, shortlist, interview pack

### Should-Have Features

- [x] Basic search — filter candidates by name, agency, status, availability
- [x] Score re-run — re-rank a candidate against a different role

---

## Phase 2: Candidate Archive & Role Library ✅ SHIPPED

**Goal:** Candidates persist beyond a single hire cycle; roles are reusable templates

### Must-Have Features

- [x] Candidate archive — all candidates visible across roles with status history
- [x] Semantic candidate search — pgvector embeddings for "find candidates similar to X"
- [x] Role description library — save/edit/reuse internal job description templates
- [x] Candidate-to-role history — view all roles a candidate has been evaluated against
- [x] Archive filter/sort — filter by skills, score range, date, agency, role, availability

### Should-Have Features

- [x] Bulk CV upload — upload multiple CVs in a single batch, queue for AI processing
- [ ] Duplicate detection — flag candidates whose CV matches an existing profile _(deferred — see tracker)_

---

## Phase 3: Agency Management & Collaboration ✅ SHIPPED

**Goal:** Track recruitment agencies and enable team collaboration on candidates

### Must-Have Features

- [x] Recruitment agency CRUD — create/edit/archive agencies with contact details
- [x] Candidate-agency linkage — assign candidate to agency on upload
- [x] Candidate notes — add timestamped notes (interview feedback, decisions) per candidate
- [x] Agency performance view — list of candidates per agency with their scores
- [x] Multi-user collaboration — multiple recruiters per tenant, shared candidate pool

### Should-Have Features

- [x] Agency notes — notes at the agency level
- [x] Candidate status tags — new / shortlisted / interviewing / offered / hired / rejected
- [x] Activity log — audit trail per candidate (logins, uploads, role changes, status changes)

---

## Phase 4: Side-by-Side Comparison & UX Polish ✅ SHIPPED

**Goal:** Make the recruiter experience delightfully fast and data-rich

### Must-Have Features

- [x] Shortlist export — export ranked shortlist as PDF for sharing with hiring manager
- [x] Dashboard home — active roles, recent uploads, top candidates, next interviews at a glance

### Should-Have Features

- [x] Gemini model toggle — per-tenant setting to use Gemini instead of Claude
- [x] Score explanation modal — expand any dimension score to read full AI reasoning
- [ ] Candidate comparison tray — select 2-5 candidates, open side-by-side view _(deferred)_
- [ ] Keyboard shortcuts — power-user navigation _(deferred)_

---

## Phase 5: Admin & Operational Hardening 🚧 PARTIAL

### Must-Have Features

- [x] Audit log — track logins, uploads, role changes, deletions _(implemented)_
- [ ] Health endpoint — `/api/health` for Docker health check (issue [#35](https://github.com/olafkfreund/SkillAi/issues/35) — corrected 2026-04-27, route does not yet exist)
- [x] Security hardening — CSP headers, rate limiting on auth, session guards, RLS audits
- [ ] Admin panel — user invite shipped (`src/app/(dashboard)/dashboard/users/invite-form.tsx`); tenant/role management pending (Epic [#37](https://github.com/olafkfreund/SkillAi/issues/37))
- [ ] File storage migration — switch to Garage (S3-compatible) for production
- [ ] Rate limiting — per-tenant AI API usage limits to control costs
- [ ] Backup strategy — documented PostgreSQL dump + volume backup procedure

### Should-Have Features

- [ ] AI cost tracking — log token usage per scoring run (issue [#36](https://github.com/olafkfreund/SkillAi/issues/36))
- [ ] Role permission fine-tuning
- [ ] HTTPS via Caddy

---

## Phase 6: Beyond Original Roadmap ✅ SHIPPED

Features delivered mid-flight, not in the original v1.0.0 plan.

### Commercial & Placement

- [x] **Candidate day rate fields** — what we pay + what we bill + currency, per candidate
- [x] **Role customer day rate (budget)** — client budget per role with currency
- [x] **Margin calculation** — real-time per-candidate margin (role budget − candidate rate) on the role detail page and internal PDFs; hidden from customer-facing PDFs
- [x] **AI budget signal** — Claude receives budget context as a soft signal in the scoring prompt; flags over-budget candidates in summary without penalising the four structured dimensions (DEC-009)
- [x] **Location + language fields** — city, country, work mode (remote/hybrid/onsite), language requirements on roles AND candidates
- [x] **Role deadlines** — target fill date + cut-off date; cut-off triggers an EXPIRED badge and red banner with Edit/Archive prompts (DEC-008)
- [x] **Customer portal link** — per-customer base URL + per-role path, assembled into a one-click link on the role page

### Candidates & Internal Bench

- [x] **Internal bench** — per-tenant "Internal" system agency (auto-provisioned via migration backfill) + orthogonal availability status (`available` / `on_project` / `unavailable`) + `available_from` date; system agencies protected from archival; INTERNAL badge on ranked role results; bench quick-filter on candidate list (DEC-010)
- [x] **Structured CV profile** — AI-extracted profile (summary, skills, experience, education) cached per candidate; re-extraction on demand
- [x] **Reformat CV** — AI (Claude Haiku) cleans up raw extracted CV text into structured markdown
- [x] **Candidate role history panel** — all roles a candidate has been scored on, with scores inline
- [x] **Matching roles panel** — on candidate profile, shows roles this candidate could fit
- [x] **Add existing candidate to a role** — from archive, without re-uploading
- [x] **Bulk candidate status change** — checkbox selection + bulk status bar

### Interviews

- [x] **Interview slot scheduling** — create, edit, cancel interview slots per candidate
- [x] **ICS calendar file import** — paste or upload `.ics` to create interview slot
- [x] **Interview pack generation** — full technical + pre-screening variants, live progress feedback
- [x] **Interview transcript analysis** — upload VTT/SRT/DOCX/TXT, AI scores the interview against the role
- [x] **Next Interviews dashboard widget**

### Customers

- [x] **Customers as first-class entities** — customer CRUD, per-customer hiring framework, roles linked to customers
- [x] **Customer-facing sanitised candidate PDF** — strips internal notes, rates, margin

### Hiring Manager Persona (Epic #73)

- [x] **`hiring_manager` role** — added at rank 0.5 between viewer and recruiter; existing `requireRole(_, 'recruiter')` calls block managers cleanly with no call-site changes
- [x] **`role_managers` junction** — many-to-many assignment of managers to roles, RLS-isolated, with `is_primary` flag (any-one-approves semantics in v1)
- [x] **`candidate_role_approvals`** — per-(role × candidate × manager) decision rows; shortlist state derived in code (pending / in_review / complete); decision is `pending` / `approved` / `rejected` with optional comment
- [x] **`/dashboard/manager` landing page** — manager sees only their assigned roles with pending-count pills + "Sent N days ago" badges
- [x] **`audience='manager'` sanitisation** — extends the existing recruiter/customer audience pattern: strip rates / margin / agency / internal notes; keep score breakdown, reasoning, interview pack; tags / keywords / role / candidate edit controls become read-only; only `is_shareable=true` notes show
- [x] **Per-candidate approval UI** — Approve / Reject / Clear with comment textarea + "Approve all remaining" with inline two-step confirm
- [x] **Recruiter-side controls** — `ManagerAssignmentDialog` to assign managers, `SendForApprovalButton` to dispatch the shortlist, `ShortlistStatusPill` showing "Sent Nd ago — A/T approved, R rejected, P pending"
- [x] **Audit trail** — four new actions: `shortlist.sent`, `candidate.approved_by_manager`, `candidate.rejected_by_manager`, `role.manager_assigned`
- [x] **`notes.is_shareable`** — recruiters opt-in per note; default-private to avoid leaking internal language to managers

### Help & In-App Documentation (PR #96)

- [x] **`/dashboard/help` route** — searchable in-app documentation hub with category navigation
- [x] **20 articles across 8 categories** — Getting Started, Roles & Candidates, AI Scoring & Interviews, Hiring Manager Workflow, Agencies & Customers, Settings & Admin, Tips & Best Practice, Troubleshooting
- [x] **Audience-tagged front-matter** — each article declares its target persona (recruiter / manager / admin / all); loader filters articles to the current user's role so each persona only sees relevant content
- [x] **Static markdown loader** — `gray-matter` + Zod-validated front-matter; articles live in `src/content/help/*.md` so authoring is a flat-file drop-in with no code change

### Branding & UI Polish (PR #97)

- [x] **Agency + customer logos** — upload via existing entity edit forms; PNG / JPEG / WebP only with a 2 MB cap; rendered at 32 px in lists and 64 px on detail headers; initials avatar fallback when no logo is set
- [x] **Single checkbox column on candidate list** — consolidated bulk-select into one left-edge column; comparison icon button moved adjacent to the CV download action for a cleaner row
- [x] **Agency logo on candidate displays** — 20–32 px agency logo with initials fallback in the candidate list, role-detail cards, candidate detail header, and candidate PDF export, so the source of every candidate is visible at a glance

### Theme & Polish

- [x] **Light/dark mode toggle (v1 — shell only)** — `next-themes` provider + CSS-var token system in `globals.css`; sidebar, dashboard outer wrapper, and login page converted; toggle lives in the sidebar above sign-out; system preference detected via `enableSystem`. Detail pages, forms, and modals remain dark-only and will migrate incrementally — full conversion tracked in Epic [#103](https://github.com/olafkfreund/SkillAi/issues/103).

### Exports & PDFs

- [x] **Rich role display** — markdown rendering + meta pills + tag chips
- [x] **Role PDF** (single-role brief) + **shortlist PDF** + **candidate PDF** (internal + customer variants) + **interview pack PDF**
- [x] **Server-side PDF logging**
- [x] **Customer portal pill + budget pill on role meta bar**

### Platform & Reliability

- [x] **TanStack Query migration** — polling for AI generation progress
- [x] **Compliance audit trail + StatusBanner**
- [x] **AI reliability** — maxRetries + timeouts on all AI clients (Claude + Gemini)
- [x] **Security hardening** — CSP headers, session guard, header source pattern fixes, upload permission fixes
- [x] **Docker dev environment** — env file mapping, API key isolation, migration tooling
- [x] **Cross-origin dev policy** — allowedDevOrigins for hostname/IP access

---

## Future — Tracked on GitHub

Major pending initiatives are tracked as GitHub issues rather than in this roadmap so progress can be followed alongside implementation commits.

- **Shared folders & cloud storage integration** — tracker issue [#3](https://github.com/olafkfreund/SkillAi/issues/3) with 5 phase issues (#4 host folders, #5 Google Drive, #6 OneDrive, #7 SharePoint, #8 webhooks)

When new large initiatives are scoped, they should follow the same pattern: a tracker issue + phase issues with acceptance criteria, linked from this roadmap.

---

## Remaining Original Roadmap Items

Items from the original roadmap that remain open:

- Admin panel (users, tenants, invites) — Phase 5 — Epic [#37](https://github.com/olafkfreund/SkillAi/issues/37)
- File storage migration to Garage — Phase 5
- AI API rate limiting per tenant — Phase 5
- Backup runbook — Phase 5
- AI cost tracking — Phase 5 — issue [#36](https://github.com/olafkfreund/SkillAi/issues/36)
- HTTPS via Caddy — Phase 5
- Candidate side-by-side comparison tray — Phase 4
- Keyboard shortcuts — Phase 4
- Duplicate candidate detection — Phase 2

---

## Effort Scale Reference

| Size | Duration |
|------|----------|
| XS   | 1 day    |
| S    | 2-3 days |
| M    | 1 week   |
| L    | 2 weeks  |
| XL   | 3+ weeks |
