# Product Roadmap

> Last Updated: 2026-04-09
> Version: 1.0.0
> Status: Planning

## Phase 1: Foundation & Core MVP (2-3 weeks)

**Goal:** Working Docker app where a recruiter can upload CVs, create a job role, and get AI rankings
**Success Criteria:** End-to-end flow from CV upload → AI score → ranked list visible in UI

### Must-Have Features

- [x] Project scaffold — Next.js 16 + TypeScript + Drizzle + PostgreSQL + Docker Compose `S`
- [ ] Database schema — tenants, users, candidates, roles, scores, agencies, notes `S`
- [ ] Auth — Auth.js v5 with credentials, JWT, role-based middleware `S`
- [ ] CV upload — drag-and-drop upload, PDF/DOCX parsing, text extraction `M`
- [ ] Candidate record creation — store parsed CV text + metadata in DB `S`
- [ ] Job role creation — form to create/store role description with requirements `S`
- [ ] AI ranking engine — Claude structured output scoring per dimension `M`
- [ ] Ranked candidate list UI — sortable table with overall score + dimension scores `M`
- [ ] Single candidate profile view — full CV text, scores, AI reasoning `S`
- [ ] Interview question + code test generator — AI-generated personalised question pack per candidate+role `M`

### Should-Have Features

- [ ] Basic search — filter candidates by name, agency, date uploaded `S`
- [ ] Score re-run — re-rank a candidate against a different role `XS`

### Dependencies

- Docker Compose with PostgreSQL 17 + pgvector extension
- Anthropic Claude API key
- Auth.js v5 credentials setup

---

## Phase 2: Candidate Archive & Role Library (1-2 weeks)

**Goal:** Candidates persist beyond a single hire cycle; roles are reusable templates
**Success Criteria:** Recruiter can search historical candidates and re-rank them against a new role in < 30 seconds

### Must-Have Features

- [ ] Candidate archive — all candidates visible across roles with status history `S`
- [ ] Semantic candidate search — pgvector embeddings for "find candidates similar to X" `M`
- [ ] Role description library — save/edit/reuse internal job description templates `S`
- [ ] Candidate-to-role history — view all roles a candidate has been evaluated against `S`
- [ ] Archive filter/sort — filter by skills, score range, date, agency, role `M`

### Should-Have Features

- [ ] Bulk CV upload — upload multiple CVs in a single batch, queue for AI processing `M`
- [ ] Duplicate detection — flag candidates whose CV matches an existing profile `S`

### Dependencies

- Phase 1 complete
- Embedding model chosen and integrated (Gemini or OpenAI)

---

## Phase 3: Agency Management & Collaboration (1-2 weeks)

**Goal:** Track recruitment agencies and enable team collaboration on candidates
**Success Criteria:** Each candidate is linked to an agency; team members can leave notes and see each other's activity

### Must-Have Features

- [ ] Recruitment agency CRUD — create/edit/archive agencies with contact details `S`
- [ ] Candidate-agency linkage — assign candidate to agency on upload `XS`
- [ ] Candidate notes — add timestamped notes (interview feedback, decisions) per candidate `S`
- [ ] Agency performance view — list of candidates per agency with their scores `S`
- [ ] Multi-user collaboration — multiple recruiters per tenant, shared candidate pool `S`

### Should-Have Features

- [ ] Agency notes — notes at the agency level (commercial terms, performance) `XS`
- [ ] Candidate status tags — shortlisted / interviewing / rejected / offer / hired `S`
- [ ] Activity log — who added/updated what and when (per candidate) `S`

### Dependencies

- Phase 2 complete
- Multi-tenant RLS fully operational

---

## Phase 4: Side-by-Side Comparison & UX Polish (1 week)

**Goal:** Make the recruiter experience delightfully fast and data-rich
**Success Criteria:** Recruiter can compare 3 candidates side-by-side and produce a shortlist in under 5 minutes

### Must-Have Features

- [ ] Candidate comparison tray — select 2-5 candidates, open side-by-side view `M`
- [ ] Comparison view — dimension scores, summaries, notes for each candidate in columns `M`
- [ ] Shortlist export — export ranked shortlist as PDF or CSV for sharing with hiring manager `S`
- [ ] Dashboard home — active roles, recent uploads, top candidates at a glance `S`

### Should-Have Features

- [ ] Gemini model toggle — per-role option to use Gemini instead of Claude `S`
- [ ] Score explanation modal — expand any dimension score to read full AI reasoning `XS`
- [ ] Keyboard shortcuts — power-user navigation through candidate list `XS`

### Dependencies

- Phase 3 complete

---

## Phase 5: Admin & Operational Hardening (1 week)

**Goal:** Production-ready internal tool with admin controls and operational safety
**Success Criteria:** Admin can manage users/tenants; system is observable and resilient

### Must-Have Features

- [ ] Admin panel — manage users, roles, tenants; invite/deactivate users `M`
- [ ] Multi-tenant admin — create/manage tenants (for future multi-team use) `S`
- [ ] File storage migration — switch to Garage (S3-compatible) for production file storage `S`
- [ ] Audit log — track logins, uploads, role changes, deletions `S`
- [ ] Rate limiting — per-tenant AI API usage limits to control costs `S`
- [ ] Health endpoint — `/api/health` for Docker health check `XS`
- [ ] Backup strategy — documented PostgreSQL dump + volume backup procedure `XS`

### Should-Have Features

- [ ] AI cost tracking — log token usage per scoring run; show monthly spend per tenant `S`
- [ ] Role permission fine-tuning — granular permissions beyond 3 roles if needed `S`
- [ ] HTTPS via Caddy — automatic TLS for internal deployment `S`

### Dependencies

- Phase 4 complete
- Production Docker environment defined
- Garage storage service configured

---

## Effort Scale Reference

| Size | Duration |
|------|----------|
| XS   | 1 day    |
| S    | 2-3 days |
| M    | 1 week   |
| L    | 2 weeks  |
| XL   | 3+ weeks |
