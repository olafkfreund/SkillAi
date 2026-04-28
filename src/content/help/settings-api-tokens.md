---
title: "API tokens"
category: "Settings & Admin"
audience: ["admin", "recruiter"]
order: 50
lastUpdated: "2026-04-28"
tags: ["api", "tokens", "mcp", "claude-desktop", "automation"]
---

# API tokens

API tokens are long-lived machine-to-machine credentials that let external software — automation scripts, CI/CD pipelines, and MCP clients such as claude-desktop — authenticate with SkillAI without using a human login session. Each token is tied to the tenant and user account that created it, carries a defined set of permission scopes, and can have an optional expiry date.

## When to use tokens

| Use case | Recommended scope |
|---|---|
| Analytics scripts that pull candidate or role data | `read` |
| Workflow automation that creates or updates records | `write` |
| Administrative automation (rare; e.g. tenant provisioning scripts) | `admin` |
| claude-desktop / MCP integration | `read` or `read` + `write` depending on the tools you need |

**claude-desktop example** — once the MCP server ships (Wave 3), configure claude-desktop like this:

```json
{
  "mcpServers": {
    "skillai": {
      "url": "https://your-skillai-host/api/mcp",
      "headers": { "Authorization": "Bearer skl_prod_..." }
    }
  }
}
```

Replace `skl_prod_...` with the full token value shown at creation. The scopes on the token control which MCP tools the LLM can call — a `read`-only token cannot trigger mutations even if the MCP server exposes write tools.

## Scope guidance

- **read** — safe for any observer: analytics dashboards, reporting scripts, read-only MCP sessions. Grant this by default.
- **write** — required for workflows that create candidates, update roles, add notes, or trigger scoring. Grant only to trusted automated pipelines.
- **admin** — reserved for rare tenant-level automation (e.g. bulk user provisioning). Requires your own account to have the `admin` role. Do not grant unless the script genuinely needs it.

When in doubt, start with `read` and add `write` only if the script fails with a permission error.

## Expiry guidance

Prefer short expiry windows. Recommended defaults:

- **CI/CD scripts** — 30 or 90 days; rotate in your secrets manager on each renewal.
- **Persistent integrations** (claude-desktop, dashboard tools) — 90 days; calendar-reminder to rotate.
- **One-off scripts** — 7 days; let them expire rather than revoking manually.
- **Never** — use only for tokens in air-gapped environments where rotation is operationally difficult.

Treat tokens like passwords: rotate quarterly as a baseline hygiene practice, and immediately on any suspicion of exposure.

## Creating a token

Settings → API tokens → **Create token**. Fill in:

1. **Name** — a descriptive label so you remember where the token is used (e.g. `claude-desktop`, `ci-readonly`).
2. **Scopes** — check the permission levels the consuming client needs.
3. **Expiry** — choose from the preset options; 90 days is the default.

After clicking **Create token**, the raw token value is shown **once**. Copy it immediately into your password manager or secrets store. If you close the dialog without copying it, you must revoke the token and create a new one — the raw value is never stored in the database.

## Revoking a token

Click **Revoke** next to any token in the list, then confirm. Revocation is immediate and permanent. Any client using that token will receive a `401 Unauthorized` response on its next request.

**Revoke immediately** if:

- You suspect the token has been leaked or committed to a repository.
- The machine or service that held the token is decommissioned.
- A team member who managed a token-consuming service has left.

## Token security model

- The raw token value is never stored in the database. Only an argon2id hash is stored.
- The token prefix (first ~12 characters) is stored in plaintext for fast lookup before hash verification.
- Tokens are tenant-scoped. A token created in tenant A cannot access tenant B's data regardless of scope.
- Token usage is recorded in `last_used_at` (visible in the token list) and written to the audit log on each authenticated request.

Related: [API keys: Anthropic, Gemini, Brave, GitHub](/dashboard/help/settings-api-keys), [How AI scoring works](/dashboard/help/ai-how-scoring-works).
