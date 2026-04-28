---
title: "Your \"For you\" dashboard section"
category: "Getting Started"
audience: ["recruiter", "hiring_manager", "admin"]
order: 25
lastUpdated: "2026-04-28"
tags: ["dashboard", "for-you", "daily"]
---

# Your "For you" dashboard section

At the top of `/dashboard`, the "For you" section surfaces five action streams personalised to you. It is designed to answer **"what should I do right now?"** — not "what is the state of the world?". If a panel is empty, you have nothing waiting in that lane.

## The five widgets

Each widget caps at five items so that the section remains scannable. Click through to the linked entity to act on the item.

### Interviews today + tomorrow

Pending interview slots scheduled in the next 48 hours. Cancelled and completed slots are excluded. Use this to confirm your day's schedule at a glance and click into a slot to see the interview pack and candidate context.

### Candidates awaiting score

Candidates uploaded in the last 7 days whose score is still `pending` or `processing`. If anything has been stuck here for more than a few minutes, the AI scoring job has likely failed — open the candidate and re-run scoring from the role detail page.

### Roles with stale priorities

Roles where the priority keywords were updated more recently than at least one candidate's score on that role. Click into the role to re-score the affected candidates against the updated priorities. Stale priorities mean the ranking you are looking at does not yet reflect what you said matters.

### Expired roles

Roles where `cutoffDate < today` AND `isActive = true`. SkillAi never auto-archives a role on cut-off (see decision DEC-008) — you decide whether to extend the deadline or archive it. The widget exists so expired roles do not silently rot at the bottom of your roles list.

### Awaiting your approval

Renders only if your role is `hiring_manager`. Pending approval decisions across roles assigned to you (`role_managers`). Click through to the role's manager view to approve, reject, or request more info per candidate.

## Empty state

When all five widgets are empty, the section collapses to a single "Nothing on your plate today." panel. That is the goal — an empty "For you" section means you are caught up.

## Per-role scope notes

- **Hiring managers** see only their assigned roles' approval requests, and only the approval widget. Other widgets are tenant-wide and may not be relevant.
- **Recruiters and admins** see tenant-wide items across all five widgets. There is no per-recruiter ownership model in v1 — every recruiter sees every role.

## Tips

- Refresh the page to pick up new items. Widgets render on every server-side load; there is no client-side polling.
- The five widgets run their queries in parallel inside one DB transaction, so the section adds milliseconds to the dashboard load — not seconds.
- If a widget is showing data you do not expect (e.g. a role you thought you archived), check the audit log on that entity — something may have changed it after you last looked.
