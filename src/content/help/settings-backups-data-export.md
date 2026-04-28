---
title: "Backups and data export"
category: "Settings & Admin"
audience: ["admin"]
order: 70
lastUpdated: "2026-04-28"
tags: ["backups", "data export", "gdpr", "recovery"]
---

# Backups and data export

SkillAI provides an in-app tenant data export so that admins can take a point-in-time snapshot of all their data. This is separate from the operator-level database backup (see the setup guide) and is intended as a self-service audit and recovery aid.

## What this is

The "Download tenant export now" button on the Settings page generates a ZIP archive containing one JSON file per database table for your tenant. The archive also includes a `manifest.json` that lists every file and its row count. The export is streamed directly to your browser — nothing is stored server-side.

## What is included

The ZIP contains JSON files for the following tables, all scoped to your tenant:

- **agencies.json** — all recruitment agencies and their details
- **ai_usage.json** — AI model usage records (model, tokens, cost estimates)
- **api_tokens.json** — API tokens (secrets are argon2-hashed; original values are not recoverable from this file)
- **audit_logs.json** — the full audit trail for your tenant
- **candidate_enrichments.json** — AI-enriched candidate profile data
- **candidate_role_approvals.json** — hiring manager approval decisions per candidate and role
- **candidates.json** — all candidate records including CV text and metadata
- **code_challenges.json** — code challenges linked to interview packs
- **customer_frameworks.json** — per-customer hiring frameworks
- **customers.json** — customer (client) records
- **cv_profiles.json** — structured CV profiles extracted by AI
- **email_templates.json** — saved email templates
- **interview_packs.json** — generated interview packs (metadata and status)
- **interview_questions.json** — individual interview questions within packs
- **interview_slots.json** — scheduled interview slots
- **interview_transcripts.json** — uploaded interview transcripts
- **notes.json** — all candidate and agency notes
- **role_managers.json** — manager-to-role assignments
- **roles.json** — all job roles and their descriptions
- **scores.json** — AI scoring results for every candidate-role combination
- **sent_emails.json** — log of outbound emails sent from the app
- **tenant_settings.json** — tenant configuration (encrypted values remain encrypted in the export)
- **transcript_analyses.json** — AI analysis results for interview transcripts
- **user_invitations.json** — pending and completed user invitations
- **users.json** — all user accounts for your tenant (passwords are bcrypt-hashed)
- **manifest.json** — export metadata: tenant ID, export timestamp, schema version, and row counts per table

## Including file attachments (CVs, logos)

By default the export contains JSON only. To also bundle the original binary files, check **Include file attachments (CVs, logos)** before clicking the download button.

When enabled:

- The ZIP filename gains a `-with-files` suffix so you can tell exports apart at a glance: `skillai-tenant-export-<tenantId>-<YYYYMMDD-HHMMSS>-with-files.zip`.
- A `files/` directory is added inside the ZIP with subdirectories for each entity type:
  - `files/candidates/` — original CV uploads (PDF, DOCX, etc.)
  - `files/agencies/` — agency logo images
  - `files/customers/` — customer logo images
  - `files/roles/` — role attachment files (if any)
- Each file is named `{entityId}-{originalFilename}`.
- Files are streamed directly from disk; they are never loaded entirely into server memory.
- `manifest.json` gains three extra fields: `binaryFileCount`, `totalBinaryBytes`, and `skippedFiles` (an array listing any files that could not be included, with a reason).

**This option may produce a much larger file** — typically 10–100× the size of the JSON-only export depending on how many CVs you have. Allow extra time for the download to start on large tenants.

**What is NOT included**

- Files that were deleted from disk after upload (recorded in `manifest.skippedFiles` with reason `not-found`).
- Files outside your tenant's upload directory (a safety check; recorded with reason `path-outside-tenant` if ever triggered).

## How to download

1. Log in as an admin.
2. Go to **Settings** (sidebar or top navigation).
3. Scroll to the **Backups & Data Export** card.
4. Optionally check **Include file attachments (CVs, logos)** to bundle binary files into the ZIP.
5. Click **Download tenant export now**.
6. The browser will download a file named:
   - `skillai-tenant-export-<tenantId>-<YYYYMMDD-HHMMSS>.zip` (JSON only), or
   - `skillai-tenant-export-<tenantId>-<YYYYMMDD-HHMMSS>-with-files.zip` (JSON + binaries).

The export runs entirely in-memory on the server; there is no background job or notification. For large tenants, the connection may take 15–60 seconds to complete before the download starts.

## Recommended cadence

- **Weekly manual export** — download and store the ZIP off-site (encrypted storage, separate from your infrastructure).
- **Retain exports for at least 2 years** — aligns with common GDPR and employment records obligations. Check your jurisdiction for the exact requirement.

Complements (does not replace) the operator-level `pg_dump` backup described in the setup guide. The two work together: `pg_dump` captures everything including binary state; the in-app export gives admins a portable, human-readable snapshot they can manage themselves.

## Security note

The exported ZIP contains the same sensitive data as your live database:

- Candidate PII (names, contact details, CV text)
- API token hashes and tenant settings ciphertext
- User account records (password hashes)
- Internal notes, scores, and audit logs

Treat the file with the same care as a database dump. Store it in encrypted storage, restrict access, and delete old exports when they are no longer needed.

## Restore

Restore-from-export is not yet available in-app. A future PR will deliver an import flow. For now:

- For full restores, the operator restores from a `pg_dump` backup using `pg_restore` (see your setup guide).
- For partial data recovery (e.g. accidentally deleted candidates), you can read the JSON files directly to extract the rows you need.

If you need to restore from a pg_dump, contact your SkillAI operator or refer to the **"Production Considerations"** section of `docs/setup.md`.

## Per-Entity CSV Exports

In addition to the full tenant ZIP, admins can download a focused CSV for any single entity. This is useful when you need a spreadsheet to hand off to a colleague, run a mail merge, or do a quick audit without downloading the entire archive.

### What each CSV contains

| Entity | Included columns | Excluded columns |
|---|---|---|
| **Candidates** | ID, name, contact details, file path, file type, LinkedIn/GitHub, status, location, rate, availability, Synechron ID, created date | `cvText`, `cvTextFormatted`, `embedding` (vector), `synechronCvData` (JSONB) |
| **Roles** | ID, title, file path, creator, customer, status, framework level, location, work mode, skills arrays, keywords, dates, budget, portal path, created date | `description`, `requirements` (large text fields) |
| **AI Scores** | ID, candidate ID, role ID, status, all five numeric scores, error message, created/updated dates | `technicalReasoning`, `experienceReasoning`, `culturalFitReasoning`, `communicationReasoning`, `aiSummary` (long reasoning text) |
| **Agencies** | All columns — ID, name, contact details, notes, logo path, status flags, created date | Nothing excluded |

Heavy text fields (CV text, AI reasoning, role descriptions) and binary/vector columns are excluded to keep files small and suitable for spreadsheet use. The full text is available in the ZIP export if needed.

Array-valued columns (language requirements, key skills, priority keywords, languages spoken) are serialised as semicolon-delimited values within the cell.

### When to use CSV vs the full ZIP

- **CSV** — when you want a single table in a spreadsheet, for mail merges, or for a quick audit of a specific entity. Lightweight, instant download.
- **ZIP** — when you need a complete point-in-time tenant snapshot for disaster recovery, compliance archival, or data migration. Includes every table and optionally binary file attachments.

### File naming

CSV files are named: `skillai-{entity}-{tenantId}-{YYYY-MM-DD}.csv`

The date is in UTC. Example: `skillai-candidates-550e8400-e29b-41d4-a716-446655440000-2026-04-28.csv`

### Access

Only admins can download these files. The buttons appear in the **Per-Entity CSV Exports** card on the Settings page, directly below the Backups & Data Export card. Non-admin roles will receive a `403 Forbidden` response if the URL is accessed directly.

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Download button returns a 429 error | Another export was triggered less than 60 seconds ago | Wait 60 seconds and try again. The `Retry-After` header in the response tells you how many seconds remain. |
| Download starts but never completes | Large tenant with many records; connection is slow | Wait. The connection will remain open while the ZIP is streamed. Avoid refreshing the page. |
| Download is empty or zero bytes | Browser or proxy cancelled the request before the server finished | Retry; ensure no proxy or VPN is terminating idle connections. |
| `403 Forbidden` | You are not logged in as an admin | Ask your SkillAI admin to perform the export, or have your role upgraded to admin first. |
