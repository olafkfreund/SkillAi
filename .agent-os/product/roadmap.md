# Product Roadmap

> Last Updated: 2026-05-19
> Version: 2.7.0
> Status: Phases 1–4 shipped; Phase 5 largely closed (AI cost tracking shipped #36, audit log + health endpoint + per-tenant rate limit + security hardening done; admin panel still partial — only user-invite is in, tenant/role mgmt re-opened as #37); Epic #72 children #75/#84/#76/#79/#81/#82 all shipped; Hiring Manager persona shipped (Epic #73); REST API parity, API token system, per-tenant rate limiting, and MCP server (Epic #105) shipped; cross-platform `skillai-mcp` packaging (Epic #115) shipped; light/dark mode v2 full conversion shipped (Epic #103 — PRs #161–#165); mobile responsive + PWA capstone shipped (Epic #66 — PRs #155–#159, closes #67/#68/#69/#70/#71); Slack + Teams webhook notifications shipped (#77 / PR #168); Cmd-K global command palette shipped (#78 / PR #170, closes the deferred Phase 4 keyboard-shortcut item); dashboard query batching + 6 perf indexes shipped (#83 / PR #173); AI spend breakdown dashboard shipped (#151 / PR #152); customer-share submissions index + per-role customer-sent tracking shipped (#149/#146); welcome-letter PDF + role customer-specific role IDs shipped; PR #174 (Claude Code MCP integration docs + auto-generated tool catalogue) is in flight on `docs/mcp-claude-code-integration`; further integrations tracked on GitHub

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
- [x] Keyboard shortcuts — power-user navigation ✅ shipped as Cmd-K global command palette (PR [#170](https://github.com/olafkfreund/SkillAi/pull/170), closes [#78](https://github.com/olafkfreund/SkillAi/issues/78))

---

## Phase 5: Admin & Operational Hardening 🚧 PARTIAL

### Must-Have Features

- [x] Audit log — track logins, uploads, role changes, deletions _(implemented)_
- [x] Health endpoint — `/api/health` for Docker health check; returns `{status, db, uptime, timestamp}`, unauthenticated (issue [#35](https://github.com/olafkfreund/SkillAi/issues/35))
- [x] Security hardening — CSP headers, rate limiting on auth, session guards, RLS audits
- [x] Per-tenant rate limiting — sliding-window per-token/tenant/write rate limit applied to REST + MCP entry points (shipped as part of Epic #105; supersedes the original "AI API rate limiting per tenant" item — cost control is now also covered by AI cost tracking below)
- [ ] Admin panel — only user-invite shipped (`src/app/(dashboard)/dashboard/users/invite-form.tsx`); remaining scope = tenant list/create/archive, role reassignment (admin / recruiter / hiring_manager / viewer), user deactivation/reactivation, force-password-reset, and an admin-scoped audit-log surface. Re-opened as Epic [#37](https://github.com/olafkfreund/SkillAi/issues/37)
- [ ] File storage migration — switch to Garage (S3-compatible) for production
- [ ] Backup strategy — documented PostgreSQL dump + volume backup procedure

### Should-Have Features

- [x] AI cost tracking ✅ shipped (closes [#36](https://github.com/olafkfreund/SkillAi/issues/36)) — per-tenant `ai_usage` ledger (`src/db/schema/ai-usage.ts`), server action (`src/actions/ai-usage.ts`), settings panel (`src/components/settings/ai-usage-panel.tsx`), and reports trend chart (`src/components/reports/ai-cost-trend-chart.tsx`); AI spend breakdown dashboard surfaced via `/dashboard/reports` (PR [#152](https://github.com/olafkfreund/SkillAi/pull/152), closes [#151](https://github.com/olafkfreund/SkillAi/issues/151))
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
- [x] **Refined Material 3 / Linear-inspired palette** — surface tokens (`--color-bg-app`, `--color-bg-elevated`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-border`, `--color-accent`) plus 12 status-pill tokens; WCAG AA contrast verified per token in both modes; ~325 components migrated to token references.

### MCP & Integrations (Epic #105)

- [x] **REST API parity** — 36 new HTTP routes wrapping every server-action-only mutation; OpenAPI 3.1 spec served at `/api/openapi.json` (auth-required); `withApiAuth` middleware unifies bearer-token auth, scope, RLS, rate-limit, and audit
- [x] **API token system** — new `api_tokens` table with argon2-hashed secrets via `@node-rs/argon2`; format `skl_<env>_<24-base62>`; scopes `read` / `write` / `admin` (with `admin > write > read` inclusion); UI at `/settings/api-tokens` to mint, view-once, and revoke
- [x] **Per-tenant rate limiting** — sliding-window per-token, per-tenant, and per-write; configurable via `tenant_settings`; Postgres-backed; applied to both REST and MCP entry points
- [x] **MCP server** — hosted at `/api/mcp` via streamable-HTTP transport; **48 tools** across 12 modules, **4 resources**, **3 prompts**; bearer-token auth; scope checks; write tools refuse to execute without `confirmed: true`; per-call audit log entry
- [x] **Cross-platform packaging (Epic #115)** — standalone `skillai-mcp` stdio bridge for claude-desktop subprocess integration; reads `SKILLAI_URL` + `SKILLAI_TOKEN` from env; cross-platform via Bun-built single-file binaries; **Nix flake + NixOS module shipped**; `.deb` + `.rpm` packages via `nfpm`; Homebrew / AUR / Scoop staged but **deferred** (operator chose not to maintain external repos); release pipeline self-hosted at `.github/workflows/skillai-mcp-release.yml`
- [x] **First MCP release — `skillai-mcp v0.1.0`** — 14 artefacts on GitHub Releases: 5 Bun-compiled binaries (linux x64, linux arm64, macos x64, macos arm64, windows x64) + 4 OS packages (.deb, .rpm, source tarball, Nix flake) + 5 SHA256 sidecars
- [x] **Health endpoint** — `/api/health` returns `{status, db, uptime, timestamp}`; unauthenticated for Docker healthchecks; `db` reflects pool reachability

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

### GDPR & Compliance (Epic #72, PR #130 — closes #75)

- [x] **Right-to-erasure UI (Article 17)** — admin-only "Delete candidate (GDPR)" with typed-name confirmation modal, distinct from the existing soft-archive flow. Hard-deletes the candidate row and cascades manually (explicit transactional deletes, no DB cascade migration) across 13 child tables: `sent_emails`, `transcript_analyses`, `interview_transcripts`, `interview_questions`, `code_challenges`, `interview_packs`, `interview_slots`, `candidate_role_approvals`, `notes`, `cv_profiles`, `candidate_enrichments`, `scores`, `candidates`. Removes the CV file from disk via `deleteCvFile`. (DEC-011)
- [x] **Audit log redaction (not deletion)** — existing audit_logs rows for the candidate are RETAINED but PII is redacted (`entityLabel = '[redacted-gdpr]'`, metadata replaced with `{redacted_gdpr: true, redacted_at}`) and a tombstone `candidate.deleted_gdpr` audit row is written. Preserves the action history (who did what, when) for accountability while honouring erasure of personal data.
- [x] **DSAR export (Article 15)** — admin-only "Export all data (GDPR)" button generates a single ZIP via `archiver` containing 11 JSON exports (`candidate.json`, `scores.json`, `notes.json`, `cv-profile.json`, `enrichment.json`, `audit-log.json`, `sent-emails.json`, `interview-packs.json`, `interview-slots.json`, `interview-transcripts.json`, `approvals.json`), the original CV file, plus a `README.txt` cover letter explaining each file under GDPR Article 15. Streamed via `ReadableStream` — no staging to disk.
- [x] **Two new audit actions** — `candidate.deleted_gdpr`, `candidate.dsar_exported`.

### Dashboard & Personalisation (Epic #72, PR #131 — closes #84)

- [x] **"For you" dashboard section** — new `<ForYouSection>` rendered above the existing dashboard panels, surfacing five personal action streams: pending interviews today + tomorrow, candidates awaiting score (last 7 days, status pending/processing), stale priorities (per-role count of outdated scores via `isScoreOutdatedAgainstPriorities`), expired roles (`cutoffDate < CURRENT_DATE` AND active), and manager approval requests (only renders for `hiring_manager` role).
- [x] **Per-stream caps + parallel queries** — each widget capped at 5 items; all five sub-queries run in parallel inside a single `withTenant()` call. Zero schema changes.
- [x] **All-empty collapse** — when every stream is empty, the section renders a single "Nothing on your plate today." panel rather than five empty boxes; per-widget empty states hide the widget entirely.
- [x] **Personalisation model** — hiring-managers see only their `role_managers` rows; recruiters see tenant-wide items (no recruiter-ownership / role-assignment model exists today; introducing one is deferred to a future epic).

### Leadership Reporting Dashboard (Epic #72, PR #132 — closes #76)

- [x] **`/dashboard/reports` admin-only page** — five chart areas + KPI cards. Chart areas: time-to-fill (per customer), agency hit-rate (Submission→Hire and Shortlist→Hire side-by-side), AI cost trend (LineChart with month-over-month delta), cycle health (roles >30d / expired / stuck-in-interviewing), top performers (fastest-filled roles + agencies by hit-rate).
- [x] **Date-range presets** — `?range=7d|30d|90d|12mo` URL search-param drives state; default 30d; preset button row in the page header.
- [x] **Per-chart CSV export** — every card has an "Export CSV" button → streams via `/api/reports/{metric}/csv` using a new RFC 4180 helper at `src/lib/reports/to-csv.ts`. Five metrics: time-to-fill, agency-hit-rate, ai-cost-trend, cycle-health, top-performers (the latter ships two labelled sections in one CSV).
- [x] **Real-time aggregation** — five sub-queries run in parallel inside a single `withTenant()` call; no snapshot/cron infrastructure (deferred). Time-to-fill derived via audit-log + scores join (limited-historical-data footnote when matched events are sparse).
- [x] **Three-layer admin gate** — sidebar nav `minRole: admin`, page server-component check, server action `requireRole(_, 'admin')`.

### Calendar 2-Way Sync (Epic #72, PR #133 — closes #79)

- [x] **Pull-side sync loop** — `/api/cron/calendar-sync` (Bearer-secret gated via `CRON_SECRET`) polls each connected calendar, compares events to `interview_slots`, applies the diff. Detects reschedules → updates `slot.scheduledAt` + audit `interview_slot.rescheduled_external`; detects cancellations → marks slot cancelled + audit `interview_slot.cancelled_external`. Read-only on calendar side — never modifies / deletes calendar events.
- [x] **`listGoogleEvents` + `listMicrosoftEvents`** — new helpers mirror the existing auto-refresh-on-401 pattern from outbound event creation. Refreshed accessToken is re-encrypted and persisted back to `calendar_connections`.
- [x] **Conflict resolution** — if `slot.updatedAt > event.updated`, SkillAi-side edit wins (sync skips that slot for this run). Avoids overwriting recruiter edits made just before sync fires.
- [x] **Per-connection isolation** — try/catch per connection; one expired refresh token doesn't break the run for other users. Failures captured in the response and audited as `calendar.sync_failed`.
- [x] **Time window** — `[now − 1d, now + 30d]`. Past events outside window skipped.
- [x] **External scheduler** — host crontab / GitHub Actions / k8s CronJob calls the endpoint every 15 min; SkillAi has no in-process scheduler.

### Per-Tenant Calendar OAuth Credentials (PR #134 + #135)

- [x] **Documentation** — new help article `settings-oauth-credentials.md` walks tenant admins through Google Cloud Console + Azure Portal app setup with the redirect-URI gotcha called out hard. `docs/setup.md` env-var reference table corrected.
- [x] **Per-tenant credentials in `tenant_settings`** — five new keys (`google_oauth_client_id`, `google_oauth_client_secret`, `microsoft_oauth_client_id`, `microsoft_oauth_client_secret`, `microsoft_oauth_tenant_id`), all encrypted via AES-256-GCM. Resolution order: tenant_settings → env var → 503. Existing self-hosted single-tenant deployments continue to work via env vars.
- [x] **Admin-only UI** — new "Calendar OAuth Credentials" card on `/settings`, between "General Settings" and "Default Pack Language". Mirrors the masking + show/hide / Replace pattern of `ApiKeyField`.
- [x] **Two new audit actions** — `settings.oauth_credentials_updated`, `settings.oauth_credentials_removed`. Audit metadata records `{ provider, field }` only — never the secret value.

### Admin Backups & Data Export (Epic #72, PRs #136 + #137 — closes #81)

- [x] **`/settings` "Backups & Data Export" admin card** — shows last manual export timestamp pulled from audit_logs (action `tenant.exported`); "Download tenant export now" button streams a ZIP with one JSON file per tenant-scoped table (25 tables) + manifest.json. Three-layer admin gate.
- [x] **60-second rate limit per tenant** — enforced via `MAX(createdAt)` audit-log query; 429 with `Retry-After` header when exceeded.
- [x] **Optional binary file inclusion (PR #137)** — opt-in checkbox toggles `?files=1`; when set, the ZIP gains a `files/` directory with original CV PDFs, agency / customer logos, and role attachments. Filename gets a `-with-files` suffix. Default off (preserves the JSON-only behaviour for users who don't want a 100MB+ download).
- [x] **Defence-in-depth path-traversal guard** — every absolute path is checked against `${tenantUploadRoot}/` before any filesystem access; cross-tenant paths skipped + recorded in `manifest.skippedFiles[]` with reason `path-outside-tenant`. Unit test asserts `fs.stat` is NOT invoked for blocked paths.
- [x] **Missing-file handling** — ENOENT / EACCES → skipped + recorded in `manifest.skippedFiles[]`; export does NOT fail on individual file errors.

### Per-Entity CSV Exports (Epic #72, PR #138 — closes #82)

- [x] **`/settings` "Per-Entity CSV Exports" admin card** — four download buttons: Candidates, Roles, AI Scores, Agencies. Each emits an RFC 4180 CSV scoped to the current tenant via `/api/export/tenant/csv/[entity]`.
- [x] **Single dynamic route** — typed allow-list `['candidates', 'roles', 'scores', 'agencies']`; unknown entity → 404; non-admin → 403.
- [x] **Heavy columns excluded** — `cvText` / `cvTextFormatted` / `embedding` / `synechronCvData` from candidates; `description` / `requirements` from roles; reasoning text fields from scores. Full data remains in the JSON tenant export above; CSVs are spreadsheet-friendly.
- [x] **New audit action** — `tenant.csv_exported` with metadata `{ entity, rowCount }`.
- [x] **Greenhouse / Lever / Workday formats deferred** — separate issue when there's customer demand.

### AI Cost Tracking & Spend Reporting (closes #36 + #151)

- [x] **`ai_usage` ledger table** — per-tenant token usage rows written on every Claude / Gemini call (`src/db/schema/ai-usage.ts`); fields cover model, operation, input/output tokens, estimated cost, and source surface (scoring / interview pack / transcript / welcome letter / etc.).
- [x] **Server action + settings panel** — `src/actions/ai-usage.ts` aggregates totals and recent calls; `src/components/settings/ai-usage-panel.tsx` renders the per-tenant usage card on the settings page.
- [x] **Reports trend chart + spend breakdown** — `src/components/reports/ai-cost-trend-chart.tsx` ships the AI cost trend with month-over-month delta on `/dashboard/reports`; PR [#152](https://github.com/olafkfreund/SkillAi/pull/152) adds the full AI spend breakdown dashboard (per-model, per-operation, per-user) closing [#151](https://github.com/olafkfreund/SkillAi/issues/151).
- [x] **Closes [#36](https://github.com/olafkfreund/SkillAi/issues/36)** — the original "log token usage per scoring run" Phase 5 should-have item.

### Mobile Responsive + PWA (Epic #66 — closes #67, #68, #69, #70, #71)

- [x] **PR1 — sidebar drawer + top app bar + viewport meta + `xs:400` breakpoint** ([#155](https://github.com/olafkfreund/SkillAi/pull/155), closes [#67](https://github.com/olafkfreund/SkillAi/issues/67))
- [x] **PR2 — candidate list cards + `ComparisonTray` repositioning + submissions index cards** ([#156](https://github.com/olafkfreund/SkillAi/pull/156), closes [#68](https://github.com/olafkfreund/SkillAi/issues/68))
- [x] **PR3 — candidate detail page responsive reflow + manager mobile Approve/Reject** ([#157](https://github.com/olafkfreund/SkillAi/pull/157), closes [#69](https://github.com/olafkfreund/SkillAi/issues/69))
- [x] **PR4 — forms + modals + tap-target audit** ([#158](https://github.com/olafkfreund/SkillAi/pull/158), closes [#70](https://github.com/olafkfreund/SkillAi/issues/70))
- [x] **PR5 — PWA capstone** ([#159](https://github.com/olafkfreund/SkillAi/pull/159), closes [#71](https://github.com/olafkfreund/SkillAi/issues/71) and completes Epic #66) — `manifest.json`, icons (192 / 512 / maskable-512), `apple-mobile-web-app-capable` meta, minimal service worker (network-first for HTML, cache-first for static, bypass `/api/*`), and `<InstallPrompt>` listening for `beforeinstallprompt`. Lighthouse PWA target ≥90; recruiters can "Add to Home Screen" on Android + iOS and the app launches in standalone mode.

### Slack + Teams Notifications (PR #168 — closes #77)

- [x] **Per-tenant Slack / Teams webhook URLs** — stored encrypted in `tenant_settings`; configured by tenant admins on the settings page.
- [x] **Per-user notification preferences** — recruiters opt into / out of each event class; defaults chosen for "noisy but useful" — easy to mute.
- [x] **Audit-log-driven dispatch** — fans out on candidate scored (`overall_score ≥ 85`), interview scheduled, stale priorities, manager approved / rejected shortlist, and a daily digest of "N awaiting score, M interviews this week".
- [x] **Adapters** — `src/lib/notifications/slack.ts` (webhook) + `src/lib/notifications/teams.ts` (Adaptive Card) + `dispatcher.ts` per-user fan-out.
- Webhook-only in v1 (full Slack OAuth deferred to v2); daily digest runs via external scheduler against an API route (same pattern as calendar 2-way sync).

### Cmd-K Global Command Palette (PR #170 — closes #78)

- [x] **`/`-key opens overlay search** across roles, candidates, agencies, customers, and help articles with debounced server-side search.
- [x] **Bulk actions on selected rows** — same command palette also exposes bulk-action verbs (e.g. "Bulk: archive selected candidates", "Bulk: send for approval") so power users can drive the app without leaving the keyboard.
- [x] **Closes the deferred Phase 4 "Keyboard shortcuts" item** — this single change is the keyboard-shortcut shipping vehicle.

### Dashboard Performance + Index Tuning (PR #173 — closes #83)

- [x] **Batch dashboard queries** — the 6 separate dashboard widgets now share a single `Promise.all` round-trip inside one `withTenant()` call instead of issuing 6 sequential RLS-scoped queries.
- [x] **Stat-count cache** — heavy aggregate counts (e.g. total candidates, active roles) memoised per tenant for ~30s on the dashboard request path.
- [x] **6 new indexes** — added on `candidates.tenant_id, created_at`, `scores.candidate_id, role_id`, `interview_slots.scheduled_at`, `roles.tenant_id, is_active`, `audit_logs.tenant_id, created_at`, and `role_managers.user_id, role_id` to cover the dashboard hot paths after the batching change.
- [x] Target was sub-second dashboard render at 10k+ candidates — verified locally; matches the acceptance criterion on the issue.

### Submissions + Customer Share-Link Tracking (closes #146, #149, #153)

- [x] **Submissions index page** — `/dashboard/submissions` lists every candidate sent to a customer with status + share-link state and per-customer feedback ([#150](https://github.com/olafkfreund/SkillAi/pull/150), closes [#149](https://github.com/olafkfreund/SkillAi/issues/149)).
- [x] **Per-role "sent to customer" tracking** — role detail now tracks which candidates have been formally submitted and when; recruiter receives an email notification on every customer status update ([#147](https://github.com/olafkfreund/SkillAi/pull/147) + [#160](https://github.com/olafkfreund/SkillAi/pull/160), closes [#146](https://github.com/olafkfreund/SkillAi/issues/146)).
- [x] **Customer-specific role ID** — per-customer label (e.g. "HSBC CtoolId") rendered alongside the SkillAi internal role ID for easier cross-referencing with the customer's own ATS ([#141](https://github.com/olafkfreund/SkillAi/pull/141), closes [#140](https://github.com/olafkfreund/SkillAi/issues/140)).
- [x] **Framework Level empty-state** — roles whose customer has no hiring framework now show a clean empty-state instead of a broken control ([#154](https://github.com/olafkfreund/SkillAi/pull/154), closes [#153](https://github.com/olafkfreund/SkillAi/issues/153)).

### Welcome Letter PDF (PR #144 + #145 + #148)

- [x] **AI-personalised multilingual welcome letter** — per-candidate PDF written in the candidate's preferred language; covers next-step expectations, role context, and (when applicable) a structured Karat / pre-screen STAR-format section enforced at the schema level.

### In-App Help Catch-Up (PR #172)

- [x] **Help articles updated to current state** — articles refreshed to cover all features shipped since 2026-04-28 (mobile / PWA, notifications, Cmd-K, AI cost tracking, calendar 2-way sync, GDPR erasure / DSAR, leadership reports, etc.).

### Theme Migration v2 — Full Conversion (Epic #103 — PRs #161–#165)

- [x] **All dashboard pages + status pills migrated** — PR1 [#161](https://github.com/olafkfreund/SkillAi/pull/161).
- [x] **Candidates domain converted to CSS tokens** — PR2 [#162](https://github.com/olafkfreund/SkillAi/pull/162).
- [x] **Roles + Manager domains converted** — PR3 [#163](https://github.com/olafkfreund/SkillAi/pull/163).
- [x] **Workflow surfaces converted** — PR4 [#164](https://github.com/olafkfreund/SkillAi/pull/164).
- [x] **Final sweep + housekeeping — closes [#103](https://github.com/olafkfreund/SkillAi/issues/103)** — PR5 [#165](https://github.com/olafkfreund/SkillAi/pull/165). The v1 caveat about "detail pages, forms and modals remain dark-only" no longer applies; the entire surface area now renders correctly in both modes.

### Reliability + Audit Fixes (PRs #166, #167, #169, #171)

- [x] **`notes.is_shareable` audit gap closed** ([#166](https://github.com/olafkfreund/SkillAi/pull/166), closes [#93](https://github.com/olafkfreund/SkillAi/issues/93)) — toggle now writes an audit row whenever a recruiter changes shareability.
- [x] **Anthropic API key resolution unified** ([#167](https://github.com/olafkfreund/SkillAi/pull/167), closes [#40](https://github.com/olafkfreund/SkillAi/issues/40)) — every AI helper now goes through `resolveAnthropicKey(tenantId)`; no helper falls back to the global env var without going through the tenant_settings path first.
- [x] **`docs(#41)` DO-NOT-REMOVE banners on force-dynamic routes** ([#171](https://github.com/olafkfreund/SkillAi/pull/171)) — strengthens the inline comment banners on every `export const dynamic = 'force-dynamic'` so future contributors don't strip them while the Next 16.2 + React 19 prerender bug is open.

### In-Flight (open PRs — not shipped yet)

- 🚧 **Claude Code MCP integration docs + auto-generated tool catalogue** — PR [#174](https://github.com/olafkfreund/SkillAi/pull/174) on branch `docs/mcp-claude-code-integration`. Documents the `claude mcp add` setup path against the hosted `/api/mcp` endpoint and the `skillai-mcp` stdio bridge, and auto-generates the tool catalogue from the live MCP tool registry. Move to the appropriate shipped section once merged.

---

## Future — Tracked on GitHub

Major pending initiatives are tracked as GitHub issues rather than in this roadmap so progress can be followed alongside implementation commits.

- **Shared folders & cloud storage integration** — tracker issue [#3](https://github.com/olafkfreund/SkillAi/issues/3) with 5 phase issues (#4 host folders, #5 Google Drive, #6 OneDrive, #7 SharePoint, #8 webhooks)

When new large initiatives are scoped, they should follow the same pattern: a tracker issue + phase issues with acceptance criteria, linked from this roadmap.

---

## Remaining Original Roadmap Items

Items from the original roadmap that remain open:

- Admin panel — Phase 5 — Epic [#37](https://github.com/olafkfreund/SkillAi/issues/37) (re-opened with reduced scope: tenant list/create/archive, role reassignment, user deactivation/reactivation, force-password-reset, admin-scoped audit log surface. User-invite slice already shipped.)
- File storage migration to Garage — Phase 5
- Backup runbook — Phase 5
- HTTPS via Caddy — Phase 5
- Candidate side-by-side comparison tray — Phase 4
- Duplicate candidate detection — Phase 2

### Recently closed (no longer open)

- ✅ AI cost tracking — Phase 5 — closed via [#36](https://github.com/olafkfreund/SkillAi/issues/36) (see "AI Cost Tracking & Spend Reporting" section above).
- ✅ Keyboard shortcuts — Phase 4 — closed via Cmd-K command palette PR [#170](https://github.com/olafkfreund/SkillAi/pull/170) (closes [#78](https://github.com/olafkfreund/SkillAi/issues/78)).
- ✅ Per-tenant rate limiting — Phase 5 "AI API rate limiting per tenant" — superseded and shipped as part of Epic #105 (REST + MCP entry-point rate limiting via `tenant_settings`). Per-API-cost limits sit alongside via the AI cost tracking ledger.

---

## Effort Scale Reference

| Size | Duration |
|------|----------|
| XS   | 1 day    |
| S    | 2-3 days |
| M    | 1 week   |
| L    | 2 weeks  |
| XL   | 3+ weeks |
