---
title: "Auto-match & Skills Explorer"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 15
lastUpdated: "2026-06-20"
tags: ["auto-match", "skills", "archive", "matching", "shortlist", "availability", "budget"]
---

# Auto-match & Skills Explorer

Two features help you reuse your candidate archive instead of starting every role from scratch: **auto-match** surfaces the best existing candidates the moment you create a role, and the **Skills Explorer** lets you browse your whole archive by skill.

## How auto-match works

When you create a new role, SkillAi automatically scans your existing candidate archive and surfaces the **top 3 matches** on the role detail page, usually within about 60 seconds. While it runs you'll see a loading state in the "Top matches from archive" panel; the results fill in once scoring completes — you don't need to refresh.

Behind the scenes SkillAi:

1. Finds archive candidates that are a strong semantic fit for the role description.
2. Filters out candidates who don't qualify (see below).
3. Scores the survivors with Claude against this specific role and keeps the three highest overall scores.

## What gets filtered out, and why

A candidate is excluded from auto-match when any of these is true:

- **Unavailable.** Candidates whose availability is set to *unavailable* are skipped. *Available* and *on-project* candidates are kept (on-project candidates show when they free up — see below).
- **Previously rejected by this customer.** If the candidate was rejected for any earlier role belonging to the same customer — either marked rejected on a submission or rejected by a hiring manager — they won't be re-surfaced for that customer.
- **Well over budget.** When the role has a customer day rate (budget) and the candidate's rate is in the **same currency**, candidates more than **25% over budget** are excluded. Candidates within that range stay, with the overage shown on a pill (see below).

## Reading a match

Each surfaced candidate shows:

- **Overall score** for this role. Click through to the candidate to see the full per-dimension breakdown (technical skills, experience, role-fit, communication) and Claude's reasoning — the panel keeps the summary compact and links out for the detail.
- **Availability badge** — *Available now*, or *Available from DD MMM* for someone currently on a project.
- **Rate-fit pill:**
  - **Within budget** — the candidate's rate is at or under the role budget.
  - **Over by X%** — over budget but within the 25% tolerance; the percentage is shown so you can judge the negotiation.
  - **Currency mismatch** — the candidate's rate and the role budget are in different currencies. SkillAi does **not** convert currencies automatically, so it flags the mismatch and leaves the comparison to you.

## Why a candidate might NOT appear in auto-match

Run through this checklist if you expected someone and didn't see them:

- Their availability is set to *unavailable*.
- They were previously rejected by this customer on another role.
- Their rate is more than 25% over the role budget (same currency).
- Their CV profile hasn't finished extracting yet — a freshly uploaded CV takes roughly 30–60 seconds to process before its skills and profile are available to matching.
- They simply weren't among the top 3 — auto-match only shows the strongest three. Use the full ranking or the Skills Explorer to dig deeper.

## Using the Skills Explorer

Open **Skills** in the sidebar (`/dashboard/skills`). You'll see every skill across your candidate archive as a chip, each with a count of how many candidates have it. Skills are grouped case-insensitively, so "React", "react" and " REACT " collapse into one chip.

Click any chip to jump to the candidate list filtered to that skill — answering "who knows Rust?" in two clicks instead of searching CV text.

## Combining skills with other filters

Skill filters appear as removable chips above the candidate filter bar. Click the **✕** on a chip to drop just that skill.

When more than one skill is active they are **ANDed** — only candidates who have **all** of the selected skills are shown. Skill filters also compose with the existing status, agency, availability, and search filters, so you can narrow to, say, available bench candidates who know both React and TypeScript.

## Why a skill might be missing

Only candidates whose CV profile has been **fully extracted** contribute skills. A new upload typically takes 30–60 seconds to extract; until then that candidate's skills won't appear as chips or match a skill filter. If a skill you expect is missing, give recent uploads a minute and refresh.

## Cost note

Auto-match runs a small amount of AI scoring per new role — roughly **\$0.03–\$0.05** in AI credit at current Claude pricing. You can see the running total under **Settings → AI Usage**.
