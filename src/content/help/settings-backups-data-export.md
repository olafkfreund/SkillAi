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

## What is NOT included (yet)

Binary files are not part of this export:

- **CV files** — uploaded PDFs and DOCX files stored on disk. The `filePath` field in `candidates.json` contains the server-side path so you can identify which files belong to which candidate, but the binaries themselves are not bundled into the ZIP. To back up CV files, copy the uploads volume (see the setup guide).
- **Agency and customer logos** — similarly stored on disk; paths are in the respective JSON files.

File binary export will be added in a future release.

## How to download

1. Log in as an admin.
2. Go to **Settings** (sidebar or top navigation).
3. Scroll to the **Backups & Data Export** card.
4. Click **Download tenant export now**.
5. The browser will download a file named `skillai-tenant-export-<tenantId>-<YYYYMMDD-HHMMSS>.zip`.

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

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Download button returns a 429 error | Another export was triggered less than 60 seconds ago | Wait 60 seconds and try again. The `Retry-After` header in the response tells you how many seconds remain. |
| Download starts but never completes | Large tenant with many records; connection is slow | Wait. The connection will remain open while the ZIP is streamed. Avoid refreshing the page. |
| Download is empty or zero bytes | Browser or proxy cancelled the request before the server finished | Retry; ensure no proxy or VPN is terminating idle connections. |
| `403 Forbidden` | You are not logged in as an admin | Ask your SkillAI admin to perform the export, or have your role upgraded to admin first. |
