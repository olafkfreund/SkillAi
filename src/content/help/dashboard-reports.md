---
title: "Reports dashboard"
category: "Settings & Admin"
audience: ["admin"]
order: 50
lastUpdated: "2026-04-28"
tags: ["reports", "analytics", "csv", "time-to-fill", "agency-hit-rate"]
---

# Reports dashboard

Admin-only `/dashboard/reports` page with five chart areas. Click **Reports** in the sidebar to open it. Use it to answer "how is the recruiting operation actually performing?" — cycle health, AI spend, agency value, time-to-fill.

## Date-range presets

The page is URL-driven, so links are shareable.

```
?range=7d
?range=30d
?range=90d
?range=12mo
```

Default is `30d` if no range is specified. Switch ranges from the toggle at the top of the page or by editing the URL directly.

## The five chart areas

### KPI strip

Five at-a-glance numbers across the top: active roles, candidates added (in range), candidates scored, hires, and AI spend. Hovering any value reveals the absolute count and the matching delta versus the previous equivalent period.

### Cycle Health

Three KPI tiles flagging blocked work:

| Tile | Threshold | Tone |
|---|---|---|
| Roles open >30 days | `created_at + 30d < today` AND `isActive = true` | Amber |
| Expired roles | `cutoffDate < today` AND `isActive = true` | Red |
| Candidates stuck in interviewing >14 days | `status = 'interviewing'` AND last status change >14 days ago | Red |

Each tile links to a filtered list. Some filter routes may not yet exist on this branch — placeholder links are present and will activate as the filter UI ships.

### AI Cost Trend

LineChart of daily AI spend over the selected range, with a month-over-month delta in the header. Source data is the same `ai_usage` table that powers Settings → AI Usage; this view aggregates daily.

### Agency Hit-Rate

BarChart with two series side-by-side per agency:

- **Submission to Hire %** — `hired / total candidates from this agency` × 100
- **Shortlist to Hire %** — `hired / candidates that reached shortlisted+ from this agency` × 100

Hover any bar for the raw counts. The two series tell different stories: a high submission-to-hire % means the agency sends well-targeted candidates; a high shortlist-to-hire % means the candidates they send through your filter actually land the role.

### Time-to-Fill (by customer)

BarChart of the average days from role creation to the first candidate transitioning to `hired`, grouped by customer.

**Data-quality footnote.** The chart derives the role-hire link from a join between `audit_logs` and `scores`. For older roles where audit metadata didn't include `roleId`, the data is best-effort. The chart shows a "limited historical data" warning when matched events are sparse — treat short bars on old customers with caution.

### Top performers

Two side-by-side tables at the bottom:

- **Roles closed fastest** — top roles by shortest time from creation to first hire.
- **Agencies by hit-rate** — top agencies by Submission-to-Hire %.

## Per-chart CSV export

Every card has its own **Export CSV** button. The download is focused — you get the rows behind that one chart, not a tenant-wide dump. Use the focused CSVs for spreadsheet analysis or to share a snapshot of one chart with someone who does not have admin access.

For a full tenant snapshot, use **Settings → Backups & Data Export** instead.

## Filtering

Only the date-range preset is available in v1. Per-customer and per-recruiter filters are deferred — they would require additional indexes on `scores` and `audit_logs` to perform well at scale, and are slated for a follow-up PR.

## Performance

All five sub-queries run in parallel inside one DB transaction. There is no nightly snapshot job — every page load is real-time. Expect a 200–800 ms TTFB on a tenant with a few thousand candidates; if you see seconds, the chart queries are likely missing an index — file an issue with the slow chart and your tenant's row counts.
