---
title: "Creating and editing roles"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 10
lastUpdated: "2026-05-01"
tags: ["roles", "create", "edit", "deadlines", "budget", "customer-role-id"]
---

# Creating and editing roles

A role in SkillAI is the description of a job you're hiring for. It's the input the AI scores every candidate against, so a good role pays for itself many times over.

## Creating a role

From **Roles → New role**, fill in:

### Identity

- **Title** — visible to candidates on interview packs and on customer-facing PDFs. Use the real job title, not an internal code.
- **Customer** — pick the client this role is for, or skip if it's an internal hire. New customers can be added without leaving the form. See [Customers and frameworks](/dashboard/help/customers-and-frameworks).
- **Customer-specific role ID** (optional) — the reference the customer uses for this role on their side, e.g. `ACME-2026-042` or whatever code they put in their requisition system. Independent of SkillAi's internal role ID. Shows up next to the role title on the role detail page, on the customer share-link view, and on the customer-facing PDF — so when the customer emails you "any update on ACME-2026-042?" you can find it instantly. The internal SkillAi role ID is unchanged and remains the canonical key everywhere else.
- **Framework level** — if the customer has a hiring framework configured (Junior / Mid / Senior / Principal etc.), pick the level here. The AI uses this when judging experience level.

### Description

- **Description / requirements** — paste the full JD. Markdown is rendered. Bullet points and section headers help; a wall of text doesn't. Aim for: what the team does, what the candidate will own, must-haves, nice-to-haves.

### Practical filters

- **Location** — city and country.
- **Work mode** — remote, hybrid, or onsite. Hybrid candidates won't be penalised on a hybrid role; onsite candidates applying remotely will be flagged.
- **Languages** — the languages the role requires. These are matched against the candidate's `languagesSpoken` field.

### Commercial

- **Customer day rate** (with currency) — the client's budget. Optional but powerful: combined with each candidate's rate, you get a real-time margin pill on the ranked list. See [How AI scoring works](/dashboard/help/ai-how-scoring-works) for how budget feeds the AI as a soft signal.

### Deadlines

- **Target fill date** — when you want this filled.
- **Cut-off date** — the latest date a CV can land. After this date, the role gets a red **EXPIRED** badge on the list and a banner on the detail page. The role does not auto-archive — that's deliberate (DEC-008). You decide whether to extend, close, or keep working it.

Save. The role is created, marked active, and ready for candidates.

## Editing a role

Click **Edit** on the role detail page. Anything is editable, but be aware:

- **Changing the description** does *not* automatically rescore existing candidates. Use the per-candidate **Rescore** button on cards you want refreshed. Bulk rescore is a future enhancement.
- **Changing the customer day rate** does not trigger automatic rescoring either — same reason.
- **Archiving** hides the role from the active list but preserves all scores and notes. You can unarchive at any time.

## Tips

- **Be specific about must-haves.** "5+ years in Python" scores better than "experienced Python developer" because the AI has a concrete bar to compare against.
- **Don't put the same skills twice.** The AI weights them, not counts them. Listing "Python" five times doesn't make it more important; it just makes the JD harder to read.
- **Keep one role per req.** Don't bundle "Senior backend OR mid-level full-stack" into one role — you'll get confused rankings. Two roles, two shortlists.

After saving a new role, SkillAi automatically scans your archive for the top 3 candidate matches — see [Auto-match & Skills Explorer](/dashboard/help/auto-match-and-skills).

## See also

- [Auto-match & Skills Explorer](/dashboard/help/auto-match-and-skills)
- [Tips for getting better rankings](/dashboard/help/tips-getting-better-rankings)
- [Customers and frameworks](/dashboard/help/customers-and-frameworks)
- [Uploading CVs](/dashboard/help/candidates-uploading-cvs)
