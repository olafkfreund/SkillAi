---
title: "Sending emails to candidates"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 60
lastUpdated: "2026-04-28"
tags: ["emails", "smtp", "templates", "communications"]
---

# Sending emails to candidates

SkillAI lets you send templated emails directly to candidates from the candidate detail page. Every email is logged in the **Email History** panel so you have a full audit trail — no hunting through Outlook to see what was sent or when.

## Why use this instead of email?

- **Audit trail.** Every send is recorded with the template used, exact subject and body, sender, recipient, timestamp, and outcome. Managers can't see this panel (it's recruiter-only), but it means the recruitment team always has full context.
- **Consistent messaging.** Templates ensure every candidate for a given stage gets the same professional communication.
- **No context switch.** Send directly from the candidate profile without leaving SkillAI.

## Setting up SMTP (one-time admin task)

Before any email can be sent, an admin must configure the SMTP server. Go to [Settings → Email & SMTP](/dashboard/settings) and fill in:

- SMTP host and port
- Username and password (or API key, depending on your mail provider)
- From name and from email address (the sender candidates will see)

Once saved, the "Send email" button becomes active for all candidates who have an email address on file. If SMTP is not configured, the send will return an error.

## Default templates

SkillAI seeds five default templates when your tenant is first set up. You can edit their wording at any time in Settings → Email Templates:

| Template | When to use it |
|---|---|
| **Screening invite** | Invite a candidate to an initial phone or video screen. |
| **Scoring decline** | Politely decline a candidate whose score was too low to proceed. |
| **Post interview** | Follow up after an interview — thanks for coming in, next steps. |
| **Rejection** | Formal rejection after an interview stage. |
| **Offer pending** | Let a candidate know an offer is being prepared. |

Admins and recruiters can also create custom templates in Settings.

## How to send an email

1. Open the candidate detail page.
2. In the action button row near the top, click **Send email**.
   - If the button is greyed out and says "No email address on file", add the candidate's email address first via the Edit Details form below.
3. A modal opens showing all available templates grouped by category. Click a template to proceed.
4. A preview shows the rendered subject and body with all variables substituted. Review it.
5. Click **Edit** next to Subject or Body if you want to adjust the wording for this specific send — changes are one-off and don't affect the stored template.
6. Click **Send email**, then confirm with **Yes, send** to dispatch.

The modal closes automatically on success and the Email History panel below the Notes panel updates to show the new entry.

## Variable substitution

Templates can contain `{{variable}}` placeholders that are replaced with live values when you preview or send. The eight available variables are:

| Variable | Replaced with |
|---|---|
| `{{candidate.firstName}}` | Candidate's first name |
| `{{candidate.lastName}}` | Candidate's last name |
| `{{candidate.email}}` | Candidate's email address |
| `{{role.title}}` | Title of the most recently scored role (empty if none) |
| `{{role.customerName}}` | Customer name for that role (empty if no customer) |
| `{{recruiter.name}}` | Your display name as the sender |
| `{{tenant.name}}` | Your organisation name |
| `{{tenant.followUpWindow}}` | Default follow-up window in days (currently 5) |

Missing variables are replaced silently with an empty string — no placeholder text will appear in the sent email.

## Where sent emails appear

- **Email History panel.** Directly below the Notes panel on every candidate detail page. Shows template name, recipient, subject, timestamp, sender, and a status badge (green = sent, red = failed). Hover the red badge to see the error message.
- **Audit log.** Every send attempt creates a `candidate.email_sent` entry in the activity log, visible in the audit trail.

The Email History panel is hidden for hiring managers — they see the candidate profile but not internal email correspondence.

## Troubleshooting

**"SMTP not configured"** — An admin needs to complete the SMTP setup in Settings → Email & SMTP before emails can be sent.

**"No email address on file"** — The "Send email" button is disabled. Add the candidate's email address using the Edit Details form on their profile page, then try again.

**Send failed (red status badge in Email History)** — Hover the red badge to see the error message. Common causes: incorrect SMTP credentials, the recipient address rejected the email, or a network issue between SkillAI and your mail server. Check Settings → Email & SMTP and confirm the credentials are correct.

## See also

- [Settings: API keys and SMTP](/dashboard/help/settings-api-keys)
- [Candidate statuses and the bench](/dashboard/help/candidates-statuses-and-bench)
- [Uploading CVs](/dashboard/help/candidates-uploading-cvs)
