---
title: "Candidate statuses, availability, and the internal bench"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 12
lastUpdated: "2026-04-28"
tags: ["status", "pipeline", "bench", "availability", "internal"]
---

# Candidate statuses, availability, and the internal bench

SkillAI tracks two separate things about every candidate: where they are in the **pipeline for a specific role** (status) and whether they are **free to start** at all (availability). These don't overlap, and that's deliberate.

## Pipeline status (per candidate, per their relationship to the role)

Statuses move a candidate through the hiring funnel:

| Status | When to use it |
|---|---|
| `new` | Default. CV is uploaded, scored, but not yet reviewed by a human. |
| `shortlisted` | You like them — they'll be in the pack you send to the hiring manager. |
| `interviewing` | An interview slot exists or has happened. |
| `offered` | An offer has gone out, awaiting acceptance. |
| `hired` | Done. The role is filled or partially filled by this candidate. |
| `rejected` | They're out of the running for this role. |

Change status from the **Status selector** on the candidate card or candidate detail page. Use the **bulk status bar** on a role to move many candidates at once — handy when you've reviewed a batch and want to shortlist or reject in one go.

> Statuses are stored against the candidate-role link, not the candidate. The same person can be `rejected` on Role A and `interviewing` on Role B simultaneously.

## Availability (per candidate, global across all roles)

Availability is independent of pipeline. It answers: "is this person free to start?"

| Availability | Meaning |
|---|---|
| `available` | Free now (or from the date in `available_from`). |
| `on_project` | Currently engaged. May come free later. |
| `unavailable` | Don't bother. Maybe they took another job, or asked you to stop. |

Set availability on the candidate detail page. Add an `available_from` date if "available" really means "available from May 1st".

This applies to **every** candidate, internal or external. Contractors finish contracts; permanent candidates accept other offers. Knowing who is actually free to start is more useful than knowing they were free six months ago.

## The internal bench

If your team has internal employees you place onto client roles, they live in SkillAI as candidates belonging to a special **Internal** agency.

- The Internal agency is auto-provisioned for every tenant on first run — you don't need to create it.
- You can't archive or delete the Internal agency. (Other agencies you can.)
- Internal candidates show an **INTERNAL** badge on the candidate list and on ranked role results, so you can spot them at a glance.

**Bench = `Internal agency` AND `availability = available`.** It's not a stored flag; it's just the obvious filter. Use the **Internal bench** quick-filter on the candidate list to see exactly that combination.

### Important: internal does not mean "boost"

Internal candidates do **not** get a scoring bonus. The AI scores them on the same four dimensions as anyone else (DEC-010). The badge tells you who they are; the score tells you whether they fit. Both pieces of information matter, neither replaces the other.

### Moving people in and out of the bench

- **Add an existing candidate to the bench.** From the candidate list, select one or more rows and use the bulk action **Assign to Internal agency**. They become internal employees from that moment.
- **Mark someone as on a project.** Set their availability to `on_project`. They'll still appear in semantic search and can still be added to roles, but they won't show on the bench filter.
- **They came back free.** Flip availability back to `available`. The bench filter picks them up again immediately.

## See also

- [Agencies and the internal bench](/dashboard/help/agencies-and-internal-bench)
- [The candidate archive and semantic search](/dashboard/help/candidates-archive-and-search)
