---
title: "Slack and Teams webhook notifications"
category: "Settings & Admin"
audience: ["admin"]
order: 67
lastUpdated: "2026-05-01"
tags: ["notifications", "slack", "teams", "webhook", "integrations"]
---

# Slack and Teams webhook notifications

SkillAi can push key tenant events to a Slack channel or Microsoft Teams channel via an incoming webhook. No OAuth dance, no app to install — just paste the webhook URL into Settings and pick the events you care about.

Admin-only setup. Once configured, the notifications are tenant-wide — every recruiter and admin's actions trigger them; messages aren't per-user.

## Supported platforms

- **Slack** — incoming webhook (the kind you create in a Slack app's "Incoming Webhooks" feature).
- **Microsoft Teams** — channel webhook (Teams' MessageCard format).

You can configure one of each, both, or neither. They're independent.

## Which events trigger notifications

Pick which events fire from the Settings → Notifications panel. Available triggers:

- **New candidate submission** — a recruiter sent candidates to a customer for a role.
- **Customer feedback** — a customer changed a submission status (accepted / rejected / interview_requested) or left a comment.
- **Manager approval decision** — a hiring manager approved or rejected a candidate via the manager workflow.
- **Role expired** — a role's `cutoffDate` passed and it's still active.
- **AI scoring failure** — a CV failed to score after retries (so you can intervene before the candidate sits stuck).
- **Test event** — manual button that fires a single test message; use this to verify the webhook works.

Every event type is opt-in. None fire unless you explicitly enable it.

## Setting up Slack

1. In Slack: **Apps → Manage → Custom Integrations → Incoming WebHooks** (or via a custom app's Incoming Webhooks page).
2. Pick the target channel.
3. Slack gives you a webhook URL like `https://hooks.slack.com/services/T0XXX/B0XXX/XXXXXXXX`.
4. Copy it.
5. In SkillAi: **Settings → Notifications → Slack webhook URL** → paste → Save.
6. Click **Send test** and confirm a message appears in the Slack channel.
7. Tick the events you want to fire.

## Setting up Microsoft Teams

1. In Teams: open the target channel → **More options** (...) → **Manage channel** → **Connectors** → **Incoming Webhook**.
2. Name it (e.g. "SkillAi Notifications") and click Create.
3. Teams gives you a webhook URL.
4. Copy it.
5. In SkillAi: **Settings → Notifications → Teams webhook URL** → paste → Save.
6. Click **Send test** and confirm a message appears in the Teams channel.
7. Tick the events you want to fire.

## What the messages look like

**Slack** — plain text JSON payload with a single line per event. Mentions the actor, the entity (role / candidate), and a direct link back into SkillAi.

**Teams** — MessageCard format with a title, a short body, and an "Open in SkillAi" action link. Renders as a card in the channel.

Both formats include enough context to act on without opening SkillAi (who, what, which role) but link back for the detailed view.

## What's NOT included in the payload

- **No CV text or candidate PII** beyond the candidate's first name + last name.
- **No day rates, margin, or commercial data.**
- **No AI reasoning or scoring detail.**

This keeps it safe to point the webhook at a wide channel without accidentally leaking interview content. If you want detailed messages, click through the link.

## Security notes

- **Webhook URLs are secrets.** Anyone holding the Slack / Teams URL can post messages into the channel. SkillAi stores the URL encrypted (AES-256-GCM) in `tenant_settings`. The UI masks it after save and only shows a "Replace" affordance.
- **Rotate when in doubt.** If a webhook URL leaks (e.g. accidentally pasted into a public chat), regenerate from Slack / Teams and update the value in SkillAi. Old URL stops working immediately.
- **Tenant isolation.** Tenant A's webhook URL is invisible to tenant B; the encryption key is per-platform but the row is filtered by `tenant_id` like every other tenant_settings row.

## Failure handling

- If the webhook returns a 4xx / 5xx, SkillAi logs the failure to `audit_logs` (action `notification.send_failed`) but does not block the underlying SkillAi operation. You'll see a stale message stream rather than failed core actions.
- If your Slack / Teams workspace deletes the webhook, the next event fires, fails, and audit-logs. Re-create the webhook and update the URL in Settings.

## When NOT to use webhook notifications

If you want **per-user** notifications (e.g. "ping me when MY submission gets feedback"), use the email notification on submissions instead — it's already wired to fire to the recruiter who sent the submission. Webhooks are tenant-wide and broadcast.

## Related

- Per-tenant API keys (different concept — these are AI provider keys, not webhook URLs): see "API keys: Anthropic, Gemini, Brave, GitHub".
- Audit logging: see "Troubleshooting: when things don't work" for how to inspect `audit_logs` directly.
