---
title: "GDPR right-to-erasure (deleting a candidate)"
category: "Settings & Admin"
audience: ["admin"]
order: 55
lastUpdated: "2026-04-28"
tags: ["gdpr", "privacy", "compliance", "deletion", "right-to-erasure"]
---

# GDPR right-to-erasure (deleting a candidate)

Under GDPR Article 17 ("right to erasure"), individuals can request that you delete their personal data. SkillAi provides a hard-delete flow for this purpose, distinct from the soft-archive flow used in routine recruiting. This page covers what gets deleted, what is retained for audit purposes, and how to fulfil a Subject Access Request alongside.

## Where to find it

Open any candidate detail page (admin only). Scroll to the bottom — there is a **GDPR Actions** panel with two buttons:

- **Export all data (DSAR)** — Article 15 right of access
- **Delete candidate (GDPR)** — Article 17 right to erasure

Both actions require admin role. Recruiters and hiring managers do not see the panel.

## What gets deleted

The candidate row and **all** related data:

- `scores` — every AI scoring result for this candidate
- `notes` — recruiter notes on the candidate
- `candidate_enrichments` — AI-enriched profile data
- `cv_profiles` — structured CV profiles
- `candidate_role_approvals` — hiring manager approval decisions
- `sent_emails` — outbound emails to or about the candidate
- `interview_packs` — generated interview packs
- `interview_questions` — individual interview questions
- `code_challenges` — code challenges linked to this candidate
- `interview_slots` — scheduled interview slots
- `interview_transcripts` — uploaded interview transcripts
- `transcript_analyses` — AI analysis results

The CV file on disk is also unlinked. After the operation completes, no part of the candidate's personal data exists in SkillAi.

## What gets RETAINED (with PII redacted)

`audit_logs` rows referencing this candidate are retained. The actor, action, and timestamp survive — this is required for accountability under GDPR Article 5(2) and Article 30 — but the personal data is replaced:

- `entityLabel` becomes `[redacted-gdpr]`
- `metadata` becomes `{ "redacted_gdpr": true, "redacted_at": "<iso-timestamp>" }`

A tombstone row is also written: `audit_logs.action = 'candidate.deleted_gdpr'` recording who triggered the erasure and when. This proves the deletion happened without re-introducing the very PII you just deleted.

## The typed-name confirmation

Before the delete fires, you must type the candidate's **full name exactly**. The match is case-sensitive and whitespace-sensitive. This is deliberate friction — GDPR erasure is irreversible and the typed-name check prevents an accidental click from destroying data you cannot recover.

## DSAR export (Article 15 — right of access)

The **Export all data (DSAR)** button is a separate, also admin-only action. It generates a single ZIP containing:

- 11 JSON files — one per table referencing this candidate (scores, notes, enrichments, audit log, sent emails, interview packs, code challenges, interview slots, transcripts, analyses, plus the candidate row itself)
- The original CV file as it was uploaded
- A `README.txt` cover letter explaining each file in plain language, suitable to forward to the data subject

Use this to fulfil a Subject Access Request. The DSAR export does not delete anything — it is read-only. If the data subject requests both access and erasure, run DSAR first, send them the ZIP, then run the delete.

## What this does NOT do

- **Does not delete data from external systems** — your email server, calendar provider, ATS, or anywhere else you have shared the candidate's data downstream. You must clean those up separately. The DSAR cover letter is a useful checklist for downstream cleanup.
- **Does not delete the operator-level database backup** (`pg_dump` snapshots). The candidate's data will live on in your backups until those backups expire under your retention policy. GDPR allows reasonable backup retention windows; document yours.
- **Does not delete derived statistics** — aggregated metrics (e.g. "30 candidates added in March") that no longer reference the individual.

## Audit and accountability

Every GDPR delete and every DSAR export is itself audit-logged with:

- Actor (which admin pressed the button)
- Timestamp
- Which candidate ID was affected (kept on the audit row only — the candidate row itself is gone)

Use the audit log to demonstrate compliance to your DPO or to a regulator. The tombstone audit row is the proof you fulfilled the request.

## Related articles

- [Backups and data export](/dashboard/help/settings-backups-data-export) — tenant-wide ZIP export, useful for compliance archival
