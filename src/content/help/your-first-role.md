---
title: "Your first role: golden-path walkthrough"
category: "Getting Started"
audience: ["recruiter", "admin"]
order: 2
lastUpdated: "2026-04-28"
tags: ["walkthrough", "onboarding", "first-role", "golden-path"]
---

# Your first role: golden-path walkthrough

This is the shortest path from "I have a job to fill" to "I have a ranked shortlist". Plan on 10–15 minutes the first time, under 5 once you know the flow.

## Before you start

You'll need:

- A job description (paste-able text, or just the requirements in your head).
- One or more CVs in PDF, DOCX, ODT, RTF, TXT or MD format, each under 10 MB.
- An admin must already have configured an AI API key — see [Settings: API keys](/dashboard/help/settings-api-keys). If scoring fails immediately on every candidate, that's where to look first.

## Step 1: Create the role

From the dashboard, click **Roles** then **New role**.

Fill in:

- **Title** — what the candidate will see at the top of their interview pack.
- **Description / requirements** — paste freely. Markdown works. The richer the description, the better the AI can score against it.
- **Customer** (optional) — pick the client this role belongs to. New customers can be added inline.
- **Location, work mode, languages** — these become hard signals during scoring.
- **Customer day rate** (optional) — the client's budget. If you also fill in candidate rates, you'll get a margin column on the role detail page. See [How AI scoring works](/dashboard/help/ai-how-scoring-works) for how budget is treated.
- **Target fill date** and **cut-off date** — informational; the cut-off date triggers an EXPIRED badge but does not auto-archive (DEC-008).

Save. You're now on the role detail page.

## Step 2: Upload candidates

You have three paths:

1. **Single CV upload** — for a candidate you want to attach to this role only. See [Uploading CVs](/dashboard/help/candidates-uploading-cvs).
2. **Bulk upload** — drop a folder of CVs at once.
3. **Add an existing candidate** — pick someone already in the archive without re-uploading. Useful when a strong candidate from a past role fits this one.

Each CV is parsed within a few seconds, then queued for AI scoring. You'll see candidates appear in the ranked list with a spinner while their score lands.

## Step 3: Read the ranking

Candidates appear sorted by **overall score** (0–100). Each card shows:

- The four dimension scores: technical skills, experience level, cultural fit, communication.
- A short summary line — the AI's elevator pitch on this person.
- An INTERNAL badge if they're on your bench, plus a margin pill if you've filled in rates.

Click a candidate to open the candidate detail page.

## Step 4: Work the shortlist

On the role detail page, change a candidate's status (`new` → `shortlisted` → `interviewing` → `offered` / `rejected` / `hired`). Use the bulk action bar to update many at once.

For your favourites:

- Generate an [interview pack](/dashboard/help/interview-packs).
- Schedule an interview slot, or paste an `.ics` invite to create one automatically.
- Export the candidate profile as a PDF — pick **internal** for your records or **customer-facing** for the client (it strips notes, rates and margin).

Export the whole shortlist when it's ready to go to the hiring manager.

## What to do next

- [Tips for getting better rankings](/dashboard/help/tips-getting-better-rankings) — how to write a role description the AI loves.
- [Bulk workflow tips](/dashboard/help/tips-bulk-workflow) — for high-volume hiring.
