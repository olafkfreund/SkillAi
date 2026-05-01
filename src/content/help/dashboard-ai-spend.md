---
title: "AI spend dashboard"
category: "Settings & Admin"
audience: ["admin"]
order: 65
lastUpdated: "2026-05-01"
tags: ["ai", "spend", "cost", "tokens", "reports"]
---

# AI spend dashboard

Found at `/dashboard/reports/ai-spend` (or via the Reports landing page → "AI spend"). Admin-only.

## What it shows

Three layers, all scoped to the current tenant:

1. **Headline cards** — total tokens, total estimated cost (USD), and number of AI calls in the selected window.
2. **Operation breakdown** — same numbers split by what the call was for: scoring runs, interview pack generation, transcript analysis, welcome letter generation, CV reformatting, semantic search embeddings, and a catch-all `other` bucket for one-off calls.
3. **Time-series chart** — daily cost, stacked by operation type, so you can see what's burning budget on which day.

## Date-range presets

The same `?range=7d|30d|90d|12mo` URL search-param model used by the Reports dashboard. Default: 30 days.

## Where the numbers come from

Every Claude / Gemini call routes through a single client wrapper that captures `{ tenantId, operation, model, promptTokens, completionTokens, costUsd }` and writes a row to `audit_logs` with `action = 'ai.api_call'`. The dashboard aggregates those rows in real time — there is no snapshot / cron / cached number to go stale.

This means:
- A call that just happened is visible within seconds.
- If you re-run scoring for a candidate, that re-run shows up as a new row, not a replacement.
- The `costUsd` is **estimated** using the per-token pricing table for each model. If Anthropic / Google change pricing, your historical numbers don't retroactively update — the at-the-time estimate sticks.

## What the dashboard is NOT

- **Not a billing source of truth.** Claude and Gemini bill you on their side; this dashboard is for operational sanity-checking. If your Anthropic invoice doesn't match this number to the dollar, that's expected.
- **Not a per-user breakdown.** v1 aggregates by operation, not by recruiter. If you need to know who's burning the most tokens, look at audit_logs directly.
- **Not a budget enforcement tool.** Spend is observed, not capped. Per-tenant rate limiting (set in `tenant_settings`) is the only enforcement layer today; it caps requests-per-window, not dollars.

## Per-tenant API keys interaction

If your tenant uses **per-tenant Anthropic / Gemini keys** (set in Settings → API keys), the calls hit your billing account directly and the spend you see here is what you actually pay. If your tenant falls back to platform keys (no per-tenant key configured), the spend is still tracked but billing flows to the platform operator — talk to them about reconciling.

## Common patterns

- **Sudden jump on a Tuesday morning:** usually a bulk CV upload + bulk score-run on a new role. Check the time-series chart and cross-reference the role's `audit_logs`.
- **Welcome letter slice growing:** healthy signal that recruiters are actively shortlisting and personalising candidate communication. Each letter is one call, similar cost to a single scoring run.
- **Transcript analysis dominating:** transcripts are long; analysis calls are the most token-heavy single op type. If this is eating budget, consider summarising transcripts before analysis or limiting transcript analysis to final-round candidates.
- **Embeddings near-zero:** expected. Embeddings are tiny per call.

## Exporting

Each chart has an "Export CSV" button (same pattern as the Reports dashboard). The CSV format is RFC 4180.

## Related

- Per-tenant rate limiting: see "API tokens" article.
- Per-tenant API keys: see "API keys: Anthropic, Gemini, Brave, GitHub".
- General reporting dashboard: see "Reports dashboard".
