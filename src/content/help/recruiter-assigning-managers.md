---
title: "Assigning managers and sending the shortlist for approval"
category: "Hiring Manager Workflow"
audience: ["recruiter", "admin"]
order: 30
lastUpdated: "2026-04-28"
tags: ["recruiter", "approvals", "shortlist", "managers"]
---

# Assigning managers and sending the shortlist for approval

Hiring managers don't see roles automatically. Until you assign them on the role detail page, they have no visibility — and they can't approve a candidate they can't see. This article walks through the recruiter-side workflow for getting the right manager in front of the right shortlist.

## Step 1: Assign managers to the role

Open the role detail page. In the right-hand panel you'll find a **Hiring managers** section with an Assign button.

Click it to open the manager assignment dialog. You can:

- Pick from existing managers in your tenant.
- Add multiple managers per role — the engineering lead and the department head, say.
- Mark one as the **primary** manager. Their decisions carry more weight in the dashboard summary, but any assigned manager can approve or reject.

Once assigned, the manager sees the role appear in their dashboard the next time they log in.

## Step 2: Curate the shortlist

Before you send anything for approval, do the recruiter work:

- Run AI scoring on every candidate uploaded for the role.
- Apply your own filters — agency, availability, location, language.
- Mark the candidates you want the manager to consider as **shortlisted** (status pill on the candidate row).

If you've left status as "new" on a candidate, they won't be part of the shortlist that goes for approval. The shortlist for approval is exactly the candidates with status `shortlisted` on this role.

> Don't dump the full ranked list on the manager. The whole point of shortlisting is filtering noise. Aim for 3–8 candidates per shortlist.

## Step 3: Send for approval

On the role detail page click **Send shortlist for approval**. Confirm the action — this notifies every assigned manager that they have decisions to make, and changes the role's status pill to **Awaiting approvals**.

You can re-send a shortlist after adding or removing candidates — managers see the updated list and any new candidates appear in their queue.

## Step 4: Watch the status pill

The role detail page shows you the current state of approvals:

- **Awaiting approvals** — sent, no decisions yet.
- **Partially decided** — at least one manager has actioned at least one candidate, but more decisions are pending.
- **All decided** — every shortlisted candidate has an approve or reject from every assigned manager.

Each candidate row shows individual decisions: who approved, who rejected, with comments visible inline.

## Step 5: Act on the decisions

Approved candidates are ready to progress — schedule interviews, generate an [interview pack](/dashboard/help/interview-packs), move them to `interviewing` status.

Rejected candidates: read the comment carefully. If the manager's reason is generic ("not a fit"), follow up directly — that signal helps refine the next shortlist for the same role and informs feedback to the [agency](/dashboard/help/agencies-and-internal-bench).

## Removing a manager

In the same assignment dialog, you can remove a manager. Their existing decisions stay in the audit log, but they lose access to the role and any pending decisions are released.

## Quick troubleshooting

- **Manager says they don't see the role:** check you actually assigned them, not just mentioned them in a note.
- **Shortlist looks wrong:** check candidate statuses — only `shortlisted` candidates flow into the approval list.
- **Need to undo a send:** there's no "unsend" — instead, change candidate statuses back to `new` and the shortlist effectively shrinks.

Related: [Roles: creating and editing](/dashboard/help/roles-creating-and-editing), [Candidate statuses and the bench](/dashboard/help/candidates-statuses-and-bench).
