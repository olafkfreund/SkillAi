---
title: "Calendar sync — outbound + pull updates"
category: "Settings & Admin"
audience: ["admin", "recruiter"]
order: 65
lastUpdated: "2026-04-28"
tags: ["calendar", "google calendar", "outlook", "interviews", "sync"]
---

# Calendar sync — outbound + pull updates

When a recruiter creates an interview slot in SkillAi with **Sync to calendar** ticked, the event is pushed to the connected Google or Outlook calendar (outbound). A new periodic sync also pulls reschedules and cancellations from the calendar back into SkillAi (pull side), so a meeting moved in your calendar app updates the slot in SkillAi automatically.

## Outbound sync (existing behaviour)

Happens on slot create and slot update. SkillAi calls the Google Calendar or Microsoft Graph API and stores the resulting event ID in `interview_slots.googleEventId` or `interview_slots.microsoftEventId`. Slot deletion in SkillAi triggers event deletion in the calendar.

This has been the behaviour since the calendar OAuth integration shipped. Nothing changes here.

## Pull sync (new in this PR)

A periodic job, every 15 minutes by default, calls the `/api/cron/calendar-sync` endpoint. The endpoint is invoked by an external scheduler — host cron, GitHub Actions, a Kubernetes CronJob, whatever your deployment uses. The sync:

1. Fetches events in the window `[now − 1d, now + 30d]` from each connected calendar.
2. Compares the events to the matching `interview_slots` rows.
3. **Reschedule detected** (event start or end timestamp changed) → updates `slot.scheduledAt` and writes an audit row `interview_slot.rescheduled_external`.
4. **Cancellation detected** (event missing from the response, or `status = 'cancelled'`) → marks the slot `cancelled` and writes an audit row `interview_slot.cancelled_external`.

The audit rows make it obvious which changes came from external calendars rather than from a recruiter editing in SkillAi.

## Conflict resolution

If you edited the slot in SkillAi *after* the calendar event's `updated` timestamp, SkillAi wins for that sync run — the pull sync will not overwrite your change. The next outbound sync (triggered by your edit) will push your version to the calendar, bringing the two sides back into agreement.

This means the rule is simple: **whoever edited last wins**, with SkillAi as the tiebreaker on the same-second edge case.

## What pull sync does NOT do

- **Never modifies or deletes calendar events.** The pull side is read-only against the calendar provider.
- **Never imports calendar events that weren't created by SkillAi.** A meeting you create directly in Google Calendar or Outlook does not become an interview slot. The sync only touches slots whose `googleEventId` or `microsoftEventId` matches an event in the response.
- **Never recreates a slot you deleted in SkillAi.** Once a slot is gone from `interview_slots`, the pull sync ignores its calendar event entirely.

## Where to set the cron

The deployment operator is responsible for wiring `/api/cron/calendar-sync` to a scheduler. The endpoint requires an `Authorization` header:

```
Authorization: Bearer ${CRON_SECRET}
```

Example invocation:

```
curl -X POST https://your-deployment.example.com/api/cron/calendar-sync \
     -H "Authorization: Bearer $CRON_SECRET"
```

The endpoint returns JSON describing the result of each connection's sync run. Failures per connection are isolated — one tenant's expired refresh token does not stop another tenant's sync from completing. The JSON response surfaces which connections failed and why.

Recommended cadence is every 15 minutes. Faster than that risks bumping into Google's and Microsoft Graph's per-minute quotas; slower than that means rescheduled meetings may not reflect in SkillAi for up to your interval.

## Cross-link to OAuth setup

To use any of this, your tenant first needs Google or Microsoft OAuth credentials configured. See [Calendar OAuth credentials (Google + Microsoft)](/dashboard/help/settings-oauth-credentials) in this same category.

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Sync returns `401 Unauthorized` | Missing or wrong `CRON_SECRET` in the calling scheduler | Set the env var on both sides; the values must match exactly |
| One connection's sync reports `invalid_grant` | The user's refresh token has been revoked (e.g. they changed their Google password) | Have the user disconnect and reconnect their calendar from `/settings` |
| Sync runs but finds no events on a connection that should have some | Wrong `calendar_id` saved on the connection (Google defaults to `primary`); or the user authorised a different account than they expected | Inspect `calendar_connections` for the row; have the user reconnect if needed |
| Reschedule appears not to have applied | The event was updated within the same second as a SkillAi-side edit; SkillAi won the tiebreaker | Re-run the sync; or edit the slot in SkillAi to match |
| Hitting Google or Microsoft Graph rate limits | Cron interval is too aggressive, or you have a very large number of connected calendars | Increase the cron interval to 30 minutes; both providers' quotas are well within typical use at 15-minute cadence |

Stale tokens (token close to expiry) refresh automatically when sync runs — you do not need to handle this case manually.
