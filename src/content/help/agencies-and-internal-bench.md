---
title: "Recruitment agencies and the internal bench"
category: "Agencies & Customers"
audience: ["recruiter", "admin"]
order: 10
lastUpdated: "2026-04-28"
tags: ["agencies", "internal-bench", "availability"]
---

# Recruitment agencies and the internal bench

SkillAI treats every external recruitment agency and your own internal employees as **agencies** — first-class entities that own candidates. This page explains how the model works, including the orthogonal availability concept that powers the internal bench.

## Agencies as first-class entities

Each agency record holds:

- Name, contact email, contact phone.
- Free-text **agency notes** — track performance, payment terms, account manager history.
- Active / archived state — archived agencies stay in the database for the audit trail but don't show up in pickers.

When you upload a CV you assign the candidate to an agency. From then on, every candidate in the system belongs to exactly one agency, and the agency view shows you all candidates that came from that source — with their scores across every role they've been evaluated against.

That's how you answer the question "is Agency X actually delivering quality candidates, or just volume?" Open the agency, look at the score distribution.

## The Internal system agency

Every tenant gets one **Internal** agency, auto-provisioned. It's marked with two flags in the database — `is_internal` (semantic: "these are our own people") and `is_system` (operational: "you can't archive me"). You'll see it in the agency picker labelled **Internal**, and it's protected from accidental deletion.

This is where you put your own employees who should be considered against client roles — your bench. Upload them like any other candidate, assign them to Internal, and they'll surface in role rankings alongside agency candidates.

## Availability is orthogonal to status

This is the bit that trips people up. There are two independent fields on every candidate:

- **Pipeline status** — `new` / `shortlisted` / `interviewing` / `offered` / `hired` / `rejected`. Tracks where a candidate is in a specific hiring process.
- **Availability** — `available` / `on_project` / `unavailable`, with an optional **available from** date.

A candidate can be `shortlisted` for a role and `on_project` at the same time — meaning "we love them, but they're billing for someone else right now." That's not a contradiction; it's reality.

> "On bench" is not a stored flag. It's a **derived view**: agency is Internal AND availability is `available`. The candidate list has a quick-filter that applies both at once.

This orthogonal model also works for external candidates — a contractor finishing their current engagement is `available_from = 2026-05-15`. Same field, same logic, no special-casing.

## The INTERNAL badge

Internal candidates show an **INTERNAL** badge on the candidate list and on every ranked role result. It's a visual signal, not a scoring boost — internal candidates are scored identically to external ones. The AI doesn't know or care which agency a candidate belongs to.

That's deliberate. Fit is fit. If your own employee genuinely matches a client role better than the four agency candidates, they should win — but they should win on the same scoring criteria, not on a thumb on the scale.

## Bulk move to Internal

If you've been uploading candidates without setting their agency and want to fix it, the candidate list has a **Bulk assign to Internal** action — select candidates, click the bulk action bar, done.

## What you can't do

- **Archive Internal.** The system agency is protected. Archive its candidates individually if you no longer want them surfaced.
- **Have two Internal agencies.** A unique constraint enforces one per tenant.
- **Score-boost Internal.** No setting exists for this and there won't be one — see [How AI scoring works](/dashboard/help/ai-how-scoring-works).

Related: [Customers and frameworks](/dashboard/help/customers-and-frameworks), [Candidate statuses and the bench](/dashboard/help/candidates-statuses-and-bench), [Uploading CVs](/dashboard/help/candidates-uploading-cvs).
