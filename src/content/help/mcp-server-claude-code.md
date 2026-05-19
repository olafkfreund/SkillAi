---
title: "Connecting SkillAi to Claude Code (MCP server)"
category: "Settings & Admin"
audience: ["admin", "recruiter"]
order: 61
lastUpdated: "2026-05-02"
tags: ["integrations", "mcp", "claude-code", "ai", "api"]
---

# Connecting SkillAi to Claude Code (MCP server)

SkillAi exposes a built-in MCP (Model Context Protocol) server at `/api/mcp`. Once connected, you can ask Claude Code things like *"show me my top candidates for the Acme platform-engineer role"* and it will read SkillAi data — and, with explicit confirmation, change candidate statuses, add notes, or trigger a rescore — all without leaving your terminal.

This article assumes Claude Code 2.x or newer. If you also use claude-desktop, see the companion article *"Connecting SkillAi to claude-desktop (MCP server)"* — the same token works for both.

## Two ways to connect

Claude Code supports two MCP transports. SkillAi works with both:

- **HTTP transport (recommended)** — Claude Code talks directly to `/api/mcp` over HTTPS. No bridge to install. Just a URL and a bearer token in your config.
- **Stdio bridge** — same `skillai-mcp` binary used by claude-desktop, run as a subprocess. Useful if your laptop reaches the SkillAi host through a tunnel that's easier to manage from a long-lived process.

Pick HTTP unless you have a reason not to.

## 1. Generate an API token

1. Sign in to SkillAi as an admin (or as a recruiter for read+write tokens — admin scope is required for user/settings tools).
2. Go to **Settings → API tokens** and click **New token**.
3. Name it something like `claude-code-laptop` and pick a scope:
   - **read** — listings and lookups only.
   - **write** — read + state-changing tools (status, notes, rescore, approvals).
   - **admin** — write + user management and settings tools.
4. Click **Create**. Copy the `skl_prod_...` token immediately. **You will not be able to see it again.** Store it in your password manager or system keychain.

Tokens are scoped to your tenant; they cannot read data from other tenants.

## 2. Register the server

You have three places to put the config. Pick one — don't mix.

### Option A — `claude mcp add` CLI (easiest, user-level)

This writes to your user-level Claude Code config, so the token isn't in any project repo.

```bash
claude mcp add --transport http --scope user skillai \
  https://your-skillai-host/api/mcp \
  --header "Authorization: Bearer skl_prod_replace_with_your_token"
```

To use the stdio bridge instead (after installing `skillai-mcp` — see the claude-desktop article for install steps):

```bash
claude mcp add --transport stdio --scope user skillai skillai-mcp \
  -e SKILLAI_URL=https://your-skillai-host \
  -e SKILLAI_TOKEN=skl_prod_replace_with_your_token
```

Verify with `claude mcp list` — you should see `skillai` listed.

### Option B — Project `.mcp.json` (shared with the team — **read carefully**)

`.mcp.json` at the project root is checked into the repo and shared with every collaborator. **Do not commit a real token.** Either use a placeholder and have each developer replace it locally, or use the env-var pattern below and have each developer set the env var in their shell.

With env-var substitution:

```json
{
  "mcpServers": {
    "skillai": {
      "type": "http",
      "url": "${SKILLAI_URL}",
      "headers": {
        "Authorization": "Bearer ${SKILLAI_TOKEN}"
      }
    }
  }
}
```

Each developer sets `SKILLAI_URL` and `SKILLAI_TOKEN` in their shell (e.g. via `direnv`, `~/.zshrc`, or a per-project `.envrc`). If either env var is missing when Claude Code starts, the connection will fail with `401`.

### Option C — Hand-edit the user config

The user-level config lives at `~/.claude.json` on Linux/macOS or `%USERPROFILE%\.claude.json` on Windows. Add the same `mcpServers` block as in Option B (with the real token, since this file is per-user and not committed). Restart Claude Code.

## 3. Test the connection

In a new Claude Code session, run:

```
/mcp
```

You should see `skillai` listed as connected with a count of available tools. Then ask:

> List my candidates.

Claude Code will call the `list_candidates` tool and reply with the first page of results in your tenant. If you get a 401 instead, see Troubleshooting below.

## What you can ask for

The full tool catalogue is in `docs/mcp-tools.md` in the SkillAi repo. Quick examples by category:

- **Candidates** — `list_candidates`, `find_candidate_by_email`, `update_candidate_status`, `archive_candidate`. Try: *"Find the candidate with email ada@example.com and move her to interviewing."*
- **Roles** — `list_roles`, `get_role_with_candidates`. Try: *"Which candidates are top-ranked on role <role-id> with a score above 80?"*
- **Agencies & customers** — `list_agencies`, `list_customers`, `get_agency`, `get_customer`. Read-only; create agencies in the dashboard.
- **Scoring** — `get_candidate_score`, `rescore_candidate`. Try: *"Rescore candidate <id> against role <id>."*
- **Interviews** — `list_interview_packs`, `get_interview_pack`. Pack generation is dashboard-only because it's a long-running AI job.
- **Approvals** (hiring manager) — `get_approvals_for_role`, `approve_candidate`, `reject_candidate`. Try: *"Approve candidate <id> on role <id> with comment 'Strong technical, fits the team.'"*
- **Notes** — `create_note`, `update_note`, `delete_note`. Try: *"Add a note to candidate <id>: 'Confirmed availability from June 2026.'"*
- **Users** (admin) — `list_users`, `update_user_role`, `deactivate_user`.
- **Settings** (admin) — `list_configured_keys`.

You can also reference resources directly:

- `skillai://candidates/<id>` — full snapshot of one candidate.
- `skillai://roles/<id>` — role plus ranked candidates.
- `skillai://interview-packs/<id>` — pack with all questions.
- `skillai://my-shortlists` — for hiring managers, the roles awaiting your decision.

## Confirmation gating on writes

Every state-changing tool requires `confirmed: true` in its arguments. Claude Code will prompt you inline before sending a write — accept the proposed action explicitly. If you see an error like *"confirmation_required: 'create_note' is a write action"*, that means the model tried to call the tool without your explicit go-ahead — re-confirm in chat and it will retry.

This is by design: SkillAi never lets the model silently mutate your data.

## Three example workflows

**Email-with-CV introduction.** *"Draft an introduction email about candidate <id> for role <id> to hiring.manager@customer.com."* Use the `email-candidate-introduction` prompt — it pulls the score and CV summary, then composes the email body grounded in actual data.

**Weekly hiring-manager review.** *"Run my weekly review for role <id>."* Use the `weekly-shortlist-review` prompt — it summarises pending decisions and surfaces the top candidates still to look at.

**Bulk shortlist triage.** *"List active roles, then for the top 3 by recency show me the shortlisted candidates with their overall scores."* Pure read flow; no confirmation needed.

## Differences from claude-desktop

- **`/mcp` slash command** — Claude Code shows connection status, tool counts, and resources interactively. claude-desktop shows a small indicator near the input bar instead.
- **HTTP transport without a bridge** — Claude Code can call `/api/mcp` directly; claude-desktop currently always goes through `skillai-mcp` over stdio.
- **Per-project scope** — `.mcp.json` lets a team share an MCP server config (without sharing the token). claude-desktop is user-global only.
- **Inline confirmation** — Claude Code shows write tool calls in your terminal session and waits for `y/n` (or whatever your auto-approve setting is). claude-desktop pops a separate dialog.

The token, scopes, tools, resources, prompts, rate limits, and tenant isolation are all identical.

## Troubleshooting

**`/mcp` shows skillai as failed.** Run Claude Code with `--debug` (or check `~/.claude/logs/`) for the actual error. Most often it's a typo in the URL or a malformed `Authorization` header.

**401 unauthorized / "Token is invalid, expired, or revoked".** The token has been revoked, expired, or copied incorrectly. Generate a new token in Settings and replace the value in your config.

**403 / "insufficient_scope".** Your token doesn't have the scope this tool requires. Read tokens cannot do writes; write tokens cannot manage users. Either generate a higher-scope token or use a different one.

**429 / "rate_limit_exceeded".** You've hit the per-token rate limit. Wait the number of seconds in the `Retry-After` response header (typically under a minute) and try again.

**404 / no rows returned.** Most often this means the entity exists in a different tenant. Tokens are tenant-scoped; a token issued in tenant A cannot see tenant B's data.

**`${SKILLAI_TOKEN}` is interpolated literally** (i.e. the header reads as `Bearer ${SKILLAI_TOKEN}`). The env var isn't set in the shell that started Claude Code. Set it before launching, or put the literal token in `~/.claude.json` (Option C above).

**Tools list empty after connecting.** The connection authenticated but the tool catalogue didn't load — most often a transient server issue. Re-run `/mcp` after a few seconds. If it persists, check `/api/health` is returning 200 from the server.
