# Product tour

_A guided, screenshot-driven walkthrough of every major surface in SkillAI — dashboard, candidates, roles, interviews, customers, settings._

A tour through the recruiter's day-to-day, captured from the live portal. Every screen below maps to a deeper guide elsewhere in the docs — follow the **→ Read more** links to see how each piece works under the hood.

## 1. Dashboard

The first thing a recruiter sees on login. Three columns of glanceable state:

- **For you** — personal action streams: pending interviews, candidates awaiting score, stale priorities, expired roles, manager approval requests
- **Active roles + recent uploads + top candidates** — tenant-wide context
- **Next interviews** — calendar widget pulling from the integrated calendar sync

Every widget runs in a single parallel `Promise.all` inside one `withTenant()` round-trip — see [Dashboard performance + index tuning](../architecture/performance.md) for the optimisation history.

→ Read more: [System overview](../architecture/system-overview.md)

## 2. Candidate list

The candidate archive — every CV ever uploaded, filterable by skills, agency, status, availability, score range, and date. The left-edge checkbox column drives bulk actions (change status, add to a role, send for approval). Click any row to open the profile.

Each row shows the 20-px agency-logo chip with initials fallback — recruiters instantly see who sourced the candidate. Internal-bench candidates get an **INTERNAL** badge, never any AI scoring boost (see [DEC-010](../decisions/dec-010-internal-bench.md)).

→ Read more: [Audience-based view sanitisation](../code-patterns/audience-sanitisation.md)

## 3. Candidate profile

The single source of truth for a candidate. Top: identity + commercial fields (rate, availability, right-to-work). Middle: AI-extracted structured profile (summary, skills, experience, education). Right rail: shared notes, status timeline, and the candidate's history of matched roles with inline scores.

The page is rendered by an `audience`-aware component — recruiters see everything, customers see no internal notes / rates / margin / agency, managers see scores + reasoning but read-only.

→ Read more: [Audience-based view sanitisation](../code-patterns/audience-sanitisation.md), [DEC-009 — Soft budget signal](../decisions/dec-009-soft-budget-signal.md)

## 4. CV viewer

The raw extracted CV text, plus a "Reformat with AI" button that runs Claude Haiku to clean up the text into structured markdown. Useful for legacy PDFs where the extraction was messy.

→ Read more: [AI scoring pipeline](../architecture/ai-scoring-pipeline.md)

## 5. Roles list

All open roles, with status badges, customer linkage, target fill date, and cut-off date. Roles past their cut-off date show a **red EXPIRED badge** and a red banner on the detail view — but **never auto-archive**. The recruiter decides whether to extend the deadline or close the role (see [DEC-008](../decisions/dec-008-manual-archive.md)).

→ Read more: [Roadmap](../roadmap.md)

## 6. Role detail (the heart of the product)

This is where the AI ranking lives. The page shows:

- Role description + requirements + commercial fields (customer day-rate budget)
- **Ranked candidates panel** — every scored candidate, sorted by overall score, with per-dimension breakdowns (skills, experience, role-fit, communication) and AI reasoning on every row
- **Auto-match panel** (top-3 archive matches) — surfaces when a new role is created
- Manager assignment + send-for-approval workflow
- Customer share-link generator

Margin is computed inline (`role.customerDayRate − candidate.candidateRate`) and shown to recruiters. Over-budget candidates aren't filtered out — Claude is told about the budget as a *soft signal* in the prompt, not a scored dimension (see [DEC-009](../decisions/dec-009-soft-budget-signal.md)).

→ Read more: [AI scoring pipeline](../architecture/ai-scoring-pipeline.md), [REST API for scoring](../rest-api/endpoints.md#scoring)

## 7. Agencies

Recruitment agencies are first-class entities. Each agency has contact details, notes, a logo, and a candidate list with performance metrics. The per-tenant **system "Internal" agency** is auto-provisioned and protected from archival — that's how the internal-bench model surfaces here (see [DEC-010](../decisions/dec-010-internal-bench.md)).

→ Read more: [Logo upload pattern](../code-patterns/logo-upload.md)

## 8. Settings

Per-tenant configuration: API keys (Claude + Gemini, AES-256-GCM encrypted), default pack language, trusted hosts, calendar OAuth credentials, AI cost tracking dashboard, API tokens, backups, CSV exports, and the GDPR DSAR / erasure tools (admin-only).

→ Read more: [DEC-006 — Auth.js over Clerk](../decisions/dec-006-authjs-over-clerk.md), [DEC-011 — GDPR erasure](../decisions/dec-011-gdpr-erasure.md)

## 9. Interview pack

Generated on demand per candidate × role. Includes personalised technical questions, behavioural questions, a STAR-format pre-screen variant, and an optional code challenge. Output is streamed back to the client via TanStack Query polling so the recruiter sees progress in real time.

The pack is exportable as a polished PDF (react-pdf), as is the welcome letter that goes to the candidate in their preferred language.

→ Read more: [AI scoring pipeline](../architecture/ai-scoring-pipeline.md)

---

## What's not in screenshots

A few surfaces ship today but didn't make this batch:

- **Manager approval queue** (`/dashboard/manager`) — hiring managers see only their assigned roles with pending counts
- **Customer share view** — public, sanitised candidate cards opened via a tokenised share link
- **Reports dashboard** (`/dashboard/reports`) — time-to-fill, agency hit-rate, AI cost trend, cycle health, top performers
- **Help hub** (`/dashboard/help`) — 20+ in-app articles, audience-filtered per role
- **Skills explorer** (`/dashboard/skills`) — clickable skill chips with candidate counts
- **Submissions index** (`/dashboard/submissions`) — every candidate sent to a customer with status + share-link state
- **Command palette** (Cmd-K / `/`) — fast cross-app navigation

These are tracked for the next screenshot pass — see [Live demo](./live-demo.md) for how to capture them locally.
