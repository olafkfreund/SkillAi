---
title: "Connecting SkillAi to claude-desktop (MCP server)"
category: "Integrations"
audience: ["admin", "recruiter"]
order: 60
lastUpdated: "2026-04-28"
tags: ["integrations", "mcp", "claude-desktop", "ai", "api"]
---

# Connecting SkillAi to claude-desktop (MCP server)

SkillAi exposes a built-in MCP (Model Context Protocol) server at `/api/mcp`. Once connected, you can ask claude-desktop things like "show me my top candidates for the Acme platform-engineer role" and it will read SkillAi data — and, with explicit confirmation, change candidate statuses, add notes, or trigger a rescore — all without leaving the chat.

This article assumes claude-desktop 0.10 or newer. If you use Claude Code instead (or as well), see *"Connecting SkillAi to Claude Code (MCP server)"* — the same token works for both.

## What MCP is, in one paragraph

MCP is the open protocol that lets a chat client (claude-desktop, Cursor, etc.) talk to external tools. SkillAi advertises a catalogue of read-only **tools** (e.g. `list_candidates`, `get_role_with_candidates`), write **tools** that require explicit confirmation (`update_candidate_status`, `create_note`, `rescore_candidate`), URL-style **resources** (`skillai://candidates/<id>`), and prebuilt **prompts** for common workflows. The chat client picks which to call based on your message.

## 1. Generate an API token

1. Sign in to SkillAi as an admin (or as a recruiter for read+write tokens — admin scope is required for user/settings tools).
2. Go to **Settings → API tokens** and click **New token**.
3. Give it a name like `claude-desktop-laptop` and pick a scope:
   - **read** — listings and lookups only. Good for "what does my pipeline look like?" questions.
   - **write** — read + state-changing tools (status, notes, rescore, approvals).
   - **admin** — write + user management and settings tools.
4. Click **Create**. Copy the token starting with `skl_prod_...` immediately. **You will not be able to see it again.** Store it in your password manager or system keychain.

Tokens are scoped to your tenant; they cannot read data from other tenants.

## 2. Edit the claude-desktop config

On macOS the config file is at `~/Library/Application Support/Claude/claude_desktop_config.json`. On Windows it is `%APPDATA%\Claude\claude_desktop_config.json`. Add the `skillai` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "skillai": {
      "url": "https://your-skillai-host/api/mcp",
      "headers": {
        "Authorization": "Bearer skl_prod_replace_with_your_token"
      }
    }
  }
}
```

If you have other MCP servers configured (filesystem, GitHub, etc.) leave them alone — just add the `skillai` block alongside them.

Restart claude-desktop. In a new conversation you should see a "skillai" connection indicator near the input bar.

## 3. Test the connection

Type:

> List my candidates.

claude-desktop should call the `list_candidates` tool and reply with the first page of results in your tenant. If you get a 401 instead, see Troubleshooting below.

## What you can ask for

The tool catalogue covers (one example per category):

- **Candidates** — `list_candidates`, `find_candidate_by_email`, `update_candidate_status`, `archive_candidate`. Try: *"Find the candidate with email ada@example.com and move her to interviewing."*
- **Roles** — `list_roles`, `get_role_with_candidates`. Try: *"Which candidates are top-ranked on role <role-id> with a score above 80?"*
- **Agencies & customers** — `list_agencies`, `list_customers`, `get_agency`, `get_customer`. Read-only; use the dashboard to create agencies.
- **Scoring** — `get_candidate_score`, `rescore_candidate`. Try: *"Rescore candidate <id> against role <id>."*
- **Interviews** — `list_interview_packs`, `get_interview_pack`. Pack generation itself is dashboard-only because it's a long-running AI job.
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

Every state-changing tool requires `confirmed: true` in its arguments. claude-desktop will normally show you the proposed write and ask you to approve it before sending. If you see an error like *"confirmation_required: 'create_note' is a write action"*, that means the model tried to call the tool without your explicit go-ahead — re-confirm in the chat and it will retry.

This is by design: SkillAi never lets the model silently mutate your data.

## Three example workflows

**Email-with-CV introduction.** *"Draft an introduction email about candidate <id> for role <id> to hiring.manager@customer.com."* Use the `email-candidate-introduction` prompt — it pulls the score and CV summary, then composes the email body grounded in actual data.

**Weekly hiring-manager review.** *"Run my weekly review for role <id>."* Use the `weekly-shortlist-review` prompt — it summarises pending decisions and surfaces the top candidates still to look at.

**Bulk shortlist triage.** *"List active roles, then for the top 3 by recency show me the shortlisted candidates with their overall scores."* Pure read flow; no confirmation needed.

## Troubleshooting

**401 unauthorized / "Token is invalid, expired, or revoked".** The token has been revoked, has expired, or you've copied it incorrectly. Generate a new token in Settings and replace the value in `claude_desktop_config.json`.

**403 / "insufficient_scope".** Your token does not have the scope this tool requires. Read tokens cannot do writes; write tokens cannot manage users. Either generate a higher-scope token or use a different one.

**429 / "rate_limit_exceeded".** You've exceeded the per-token rate limit. Wait the number of seconds in the `Retry-After` response header (typically under a minute) and try again.

**404 / no rows returned.** Most often this means the entity exists in a different tenant. Tokens are tenant-scoped; a token issued in tenant A cannot see tenant B's data.

**Connection indicator missing.** Restart claude-desktop. If still missing, run claude-desktop from the terminal to surface its log output and check the URL/header values in your config.
