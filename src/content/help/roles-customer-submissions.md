---
title: "Sending candidates to a customer (submissions + share-link feedback)"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 22
lastUpdated: "2026-05-01"
tags: ["roles", "customer", "submissions", "share-link", "shortlist"]
---

# Sending candidates to a customer (submissions + share-link feedback)

Once you've ranked candidates against a role and the customer is ready to look, you can formally **submit** a subset to the customer. SkillAi tracks each submission, gives you a customer-facing share-link they can review through, and surfaces their feedback in your dashboard so you can act on it without chasing email replies.

This replaces the previous flow of "email a PDF, hope they reply, manually track in a spreadsheet."

## The flow at a glance

1. On the role detail page, select the candidates you want to submit (checkbox column).
2. Click **Send to customer** — choose to share the customer's pre-existing portal base URL or generate a per-role share-link.
3. SkillAi bundles the customer-safe candidate PDFs (no rates / margin / agency / internal notes) and creates a `submission` record per candidate.
4. Each candidate gets a status pill: `pending` → `under_review` → `accepted` / `rejected` / `interview_requested`.
5. The customer reviews the link, submits per-candidate feedback inline, and SkillAi emails you the moment any status changes.
6. The dashboard's "Awaiting customer feedback" widget shows everything still outstanding so nothing is lost.

## On the role detail page

A new **Sent to customer** panel sits below the ranked candidate list. It shows every candidate you've already submitted for this role, with:

- The submission status pill (see below).
- The date sent.
- A timestamp of the customer's last response, if any.
- A direct link to the customer's view of that candidate's PDF.

If a candidate is still on the role but not yet submitted, the **Send to customer** action remains available. You can submit additional candidates to the same role over time — submissions are append-only.

## Submission status pill

Each submitted candidate carries one of:

- **`pending`** — submitted, the customer hasn't opened the link yet.
- **`under_review`** — the customer has opened the candidate's view at least once.
- **`accepted`** — the customer marked them a yes (typically meaning "let's interview").
- **`rejected`** — the customer marked them a no, with optional comment.
- **`interview_requested`** — the customer wants you to schedule an interview. Useful when "accepted" alone doesn't capture the next step.

The pill colour scheme follows the standard status pill pattern (token-based for light/dark mode parity).

## The customer share-link

The link is **per-role** — it scopes the customer to the candidates you submitted on that specific role. They cannot see other roles, candidates not on this submission, or any internal SkillAi data.

What the customer sees:
- Each submitted candidate's customer-facing PDF (same artefact as the existing candidate PDF customer variant).
- A simple status dropdown per candidate.
- A free-text comment box per candidate.

What the customer does NOT see:
- Day rates, margin, or budget.
- Agency identity / internal notes.
- Other candidates on the role they weren't sent.
- Other roles or any tenant data.

The link is bearer-token style — anyone holding the URL can submit feedback. Treat it like a Google Doc share-link: send it through the customer's expected channel, and rotate or revoke if it leaks (the URL is single-use-style and can be invalidated from the role detail panel).

## Email notifications back to you

When a customer changes a candidate's submission status or leaves a comment, SkillAi emails the recruiter who originally sent the submission. The email includes:
- Which candidate.
- Which role.
- The new status + comment if any.
- A direct link to the candidate detail page.

This means you don't need to refresh the role detail page — your inbox is the trigger.

## Awaiting customer feedback dashboard widget

A new widget on `/dashboard` shows every submission that's `pending` or `under_review` across all your roles, ordered by oldest-first. If a customer is sitting on a candidate for too long, you'll see it here without hunting.

## Submissions index page

Visit `/dashboard/roles/submissions` for the cross-role view: every submission you've ever sent, grouped by customer, filterable by status. Useful for monthly reporting ("how many candidates did I submit this month and what was the accept rate per customer").

## Tips

- Submit in small batches (3–5) rather than a 20-candidate dump. Customers respond faster to a curated shortlist.
- Re-submitting a candidate that was previously rejected creates a new submission row — the old `rejected` status stays in the history. Use the comment field to explain "round 2 — different team".
- The customer's view is read-only on candidate content. They cannot edit the PDF or see your scoring; only respond with status + comment.

## Related

- Customer-facing PDF format: see "Customers, hiring frameworks, and customer portal links".
- Audience-based view sanitisation (what customers see vs recruiters): see the architecture pattern in CLAUDE.md.
