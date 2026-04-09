# Spec Requirements Document

> Spec: Core MVP Foundation
> Created: 2026-04-09
> Status: Planning

## Overview

Build the complete Phase 1 foundation of SkillAI — a working, Dockerised, multi-tenant recruiting portal where a recruiter can log in, upload CVs, create a job role, trigger Claude AI ranking, and view a sorted and filtered ranked candidate list with individual profile views. This spec delivers every must-have Phase 1 feature as a single cohesive deliverable, since all features are interdependent and the app has no useful state without all of them.

## User Stories

### Recruiter Logs In and Sets Up a Role

As a recruiter, I want to log in securely and create a job role with a description, so that I have a target to rank candidates against.

The recruiter navigates to the app, enters credentials, and is taken to the dashboard. They create a new role by entering a title and pasting or typing a job description. The role is saved and visible in the roles list.

### Recruiter Uploads CVs and Gets AI Rankings

As a recruiter, I want to drag-and-drop one or more CV files and have the AI automatically score each candidate against the selected role, so that I get a ranked shortlist within seconds without manual review.

The recruiter selects an active role, then drags PDF or DOCX files onto the upload zone. Each file is parsed, a candidate record is created, and Claude scores the candidate against the role description returning per-dimension scores and reasoning. The ranked list updates as each score completes.

### Recruiter Reviews and Filters the Candidate List

As a recruiter, I want to view all ranked candidates in a sortable, filterable table and open any candidate's full profile, so that I can quickly navigate to the most relevant candidates and understand why they scored as they did.

The recruiter sees a table of candidates with overall score, dimension scores, name, and upload date. They use the filter sidebar to narrow by score range, upload date, or agency. They click a candidate row to open the profile view showing the full CV text, all dimension scores, and Claude's reasoning per dimension.

## Spec Scope

1. **Project Scaffold** - Next.js 15 + TypeScript, Drizzle ORM, Docker Compose with `pgvector/pgvector:pg17`, hot-reload dev setup, multi-stage production build
2. **Database Schema** - All 7 core tables (tenants, users, candidates, roles, scores, agencies, notes) with RLS policies and pgvector column on candidates
3. **Authentication** - Auth.js v5 credentials provider, JWT sessions, role-based middleware (admin / recruiter / viewer), tenant ID embedded in JWT and set as PostgreSQL session variable per request
4. **CV Upload & Parsing** - Drag-and-drop upload zone, Server Action handler, pdf-parse (PDF) + mammoth (DOCX) text extraction, 10MB limit, stored in Docker named volume
5. **Candidate Record Creation** - Structured candidate record saved to DB from parsed CV text including extracted name, email (if present), raw text, and file reference
6. **Job Role Management** - Create/edit/view job roles with title, description, requirements text; role list page
7. **AI Ranking Engine** - Claude `claude-sonnet-4-6` structured output scoring: overall score + 4 dimensions (technical_skills, experience_level, role_fit, communication_indicators) + per-dimension reasoning; scores stored in DB
8. **Ranked Candidate List UI** - TanStack Table with sort (by overall score, by dimension, by date), filter sidebar (score range slider, date range picker, agency multi-select), pagination
9. **Single Candidate Profile View** - Full CV text, radar/bar chart of dimension scores, per-dimension reasoning text, candidate metadata

## Out of Scope

- Gemini model toggle (Phase 2)
- Semantic candidate search / pgvector embeddings (Phase 2)
- Bulk CV upload with queue (Phase 2)
- Candidate notes system (Phase 3)
- Recruitment agency management UI (Phase 3)
- Side-by-side candidate comparison (Phase 4)
- Shortlist export PDF/CSV (Phase 4)
- Admin panel / user management UI (Phase 5)
- Garage S3 storage (Phase 5)
- Email-based password reset
- Mobile-optimised layout

## Expected Deliverable

1. A recruiter can open the app in a browser (via Docker Compose), log in with credentials, and reach a dashboard — no errors, protected routes redirect unauthenticated users
2. A recruiter can create a job role, upload 3 CVs in different formats (PDF + DOCX), and within 30 seconds see all three candidates ranked in a table with overall scores and dimension breakdowns
3. The filter sidebar correctly narrows the candidate list by score range; clicking any row opens the full profile view with CV text and Claude's reasoning visible

## Spec Documentation

- Tasks: @.agent-os/specs/2026-04-09-core-mvp-foundation/tasks.md
- Technical Specification: @.agent-os/specs/2026-04-09-core-mvp-foundation/sub-specs/technical-spec.md
- Database Schema: @.agent-os/specs/2026-04-09-core-mvp-foundation/sub-specs/database-schema.md
- API Specification: @.agent-os/specs/2026-04-09-core-mvp-foundation/sub-specs/api-spec.md
- Tests Specification: @.agent-os/specs/2026-04-09-core-mvp-foundation/sub-specs/tests.md
