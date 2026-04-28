---
title: "Working efficiently with bulk upload + bulk status"
category: "Tips & Best Practice"
audience: ["recruiter", "admin"]
order: 20
lastUpdated: "2026-04-28"
tags: ["tips", "bulk", "workflow", "efficiency"]
---

# Working efficiently with bulk upload + bulk status

When an agency dumps 80 CVs on you for a single role, doing it one at a time is a waste of an afternoon. SkillAI is built around bulk operations — once you internalise the workflow it's the difference between a 4-hour shortlist and a 30-minute one.

## Bulk upload

The role detail page has a **bulk upload zone** alongside the single-CV upload. Drag a folder of CVs onto it, or shift-click to select 50 files at once, and they all queue.

What happens then:

1. Files are written to the upload volume one by one.
2. Each file is parsed (PDF / DOCX / ODT / TXT / RTF / MD).
3. Each parsed CV becomes a candidate row, linked to the agency you selected for the batch.
4. Each candidate is queued for AI scoring against the role.

You see live progress — the number of CVs ingested, the number scored, the failures. Don't wait on the page; the work continues in the background.

> **Watch the rate.** A healthy run scores roughly one candidate every few seconds. If the rate drops to zero for more than a minute, check Settings — you've probably hit an API rate limit on Anthropic or Gemini, or the API key has been revoked. The error appears against the affected candidates.

## Pick the right agency before you bulk-upload

Every CV in a batch goes to the same agency. If half your CVs are from Acme Recruiters and half are from Beta Talent, that's two batches, not one. It's worth pausing to split the folder rather than fix it candidate-by-candidate later.

If the candidates are your own employees, set the agency to **Internal** — see [Recruitment agencies and the internal bench](/dashboard/help/agencies-and-internal-bench).

## Let scoring finish before you triage

When the bulk score is done, sort the candidate list by overall score. The top 10–20 are your shortlist candidates. Below that the AI is telling you "these don't match the role".

Resist the urge to dive into individual CVs at score 35. Trust the ranking on the first pass — your time is better spent on the top 20.

## Bulk status changes

Once the ranking is sorted, do the triage as a bulk action.

The candidate list has a **selection checkbox** on each row and a **bulk action bar** that appears when anything is selected. From there you can:

- **Bulk shortlist** the top 5–10 — set their status to `shortlisted` in one click.
- **Bulk reject** the bottom of the list — set their status to `rejected`. They stay in the archive (you don't lose them) but they fall out of active filters.
- **Bulk assign to Internal** — for candidates who are your own employees but were uploaded under "Unknown" or another agency.

A typical first pass: select the top 10, bulk-shortlist. Select rows below score 50, bulk-reject. The remaining middle becomes the candidates you actually read CVs for.

## Bulk re-rank

If you change the role description or framework level after bulk scoring, the existing scores are stale. Bulk re-rank: select the candidates, click re-rank in the bulk action bar. Each is rescored against the new role description, the old score is preserved in history.

## Bulk operations and the AI cost

Every score is an AI call. Eighty candidates rescored is eighty calls — that's real money on Anthropic. Two practical guards:

- Don't re-rank until the role description is genuinely stable.
- Use Gemini for the first-pass bulk scoring on noisy lists. Switch to Claude for the curated shortlist where reasoning quality matters more than throughput.

## What bulk operations don't help with

- **Manager approval.** Sending a shortlist for approval is per-role, and you should curate before you send. Don't bulk-shortlist 80 candidates and dump it on the manager — they'll send it back.
- **Notes.** Per-candidate notes are individual; there's no bulk note. That's deliberate — generic notes are noise.
- **Interview pack generation.** It's per-candidate because the pack is personalised to their CV. Generating 20 packs is 20 separate jobs.

Related: [Uploading CVs](/dashboard/help/candidates-uploading-cvs), [Candidate statuses and the bench](/dashboard/help/candidates-statuses-and-bench), [Tips for getting better rankings](/dashboard/help/tips-getting-better-rankings).
