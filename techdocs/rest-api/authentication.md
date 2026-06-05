# Authentication

_Bearer-token auth for the SkillAI REST API and MCP server — token format, argon2id storage, scope inclusion, revocation, and the mint-and-store recipe._

The SkillAI REST API and the MCP server share a single auth model: a Bearer token in the `Authorization` header. Tokens are issued from the dashboard, stored argon2-hashed, and scoped to one of three access levels.

## Token format

Tokens look like `skl_<env>_<24-base62>` — for example `skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx` (24 random characters from the base62 alphabet). The `env` segment is either `dev` or `prod` and is purely a discriminator; the validator does not enforce environment-to-server matching.

The schema is in [`src/db/schema/api-tokens.ts`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/db/schema/api-tokens.ts). Each row stores:

- `prefix` (first 12 chars, indexed and globally unique) for O(1) lookup before the hash check.
- `hash` — the argon2id digest of the full raw token; the raw secret is **never** persisted.
- `scopes` — a text array of `read` / `write` / `admin` grants.
- `expiresAt`, `revokedAt`, `lastUsedAt` — lifecycle timestamps.

## Where to mint a token

Tokens are minted from **Settings → API Tokens** in the dashboard. The raw token is shown **exactly once** on creation — copy it into your secret store immediately. After that, only the prefix is visible in the UI for identification.

> **⚠️ Caution**
>
> There is no recovery path. If you lose a token, revoke it and mint a new one.

## Validation pipeline

Every request runs through [`validateApiToken`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/lib/api-tokens/validate.ts):

1. Format guard — the token must start with `skl_`.
2. Prefix lookup — query `api_tokens` by `prefix` (the prefix is unique, so this works without tenant context).
3. Argon2 verify — timing-safe verification of the full raw token against the stored hash.
4. Expiry check — reject if `expiresAt` has passed.
5. Revocation check — reject if `revokedAt` is set.
6. Side effects — bump `lastUsedAt` fire-and-forget, sample 1-in-10 audit log entries to avoid log flood.

Any failure returns `null` and the upstream middleware emits a 401. The validator never leaks why — `unknown prefix`, `wrong secret`, `expired`, and `revoked` all surface the same response.

## Scope hierarchy

Scopes are inclusive — a higher scope satisfies any lower requirement. From [`requireScope`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/lib/api/auth-middleware.ts) in the auth middleware:

| Granted scope | Satisfies |
|---|---|
| `admin` | read, write, admin |
| `write` | read, write |
| `read` | read only |

So an `admin` token is the master key, `write` covers everything that mutates state below admin, and `read` is safe for read-only integrations (dashboards, reports, scripts that only consume data).

> **ℹ️ Note**
>
> The hierarchy is enforced at the route level — each endpoint declares the **minimum** scope it accepts. Token scopes are stored as an array, but in practice every issued token has exactly one entry. Pick the lowest scope that lets the integration do its job.

## Mint and store recipe

1. **Mint the token in the UI.**

   Navigate to **Settings → API Tokens** in the SkillAI dashboard, click **New token**, give it a memorable name (e.g. `cli-script-staging`), pick a scope, and optionally set an expiry. The raw token appears in a one-time-view dialog.

2. **Copy it into your secret store immediately.**

   Once you close the dialog, the raw value is gone forever — only the prefix remains visible.

   ```bash
   # Example: store in 1Password CLI
   op item create --category=apicredential \
     --title='SkillAi cli-script-staging' \
     credential='skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx'

   # Or just a local env file (don't commit)
   echo 'SKILLAI_TOKEN=skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx' >> .env.local
   ```

3. **Call the API.**

   ```bash
   curl -H "Authorization: Bearer skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx" \
        https://your-skillai-host/api/roles
   ```

4. **Revoke when you're done.**

   Back in **Settings → API Tokens**, click **Revoke** on the row. Future requests with that token immediately fail with 401.

## Same token, two transports

The same token works for both the REST API and the MCP server. The MCP entry point at [`src/app/api/mcp/route.ts`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/api/mcp/route.ts) extracts the bearer token, runs the same `validateApiToken` flow, and then dispatches the JSON-RPC body to the matching tool.


**REST**

```bash
curl -H "Authorization: Bearer skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx" \
     -H "Content-Type: application/json" \
     -X POST https://your-skillai-host/api/candidates/abc-123/status \
     -d '{"status":"shortlisted"}'
```


**MCP (Claude Code)**

```bash
claude mcp add --transport http --scope user skillai \
  https://your-skillai-host/api/mcp \
  --header "Authorization: Bearer skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
```

See [Connecting from Claude Code](../mcp-server/connecting.md) for the full MCP setup.

## What gets audited

- **Token use** is logged via sampled audit (`api_token.used`, ~1 in 10 calls) so the trail captures activity without flooding the audit log.
- **Rate limit hits** are always logged (`api.rate_limit_exceeded`) — see [Rate limiting](./rate-limiting.md).
- **Mint, revoke, and expiry** events are written by the Settings UI server actions.

A revoked or expired token fails the validator with no audit entry on the failed request — invalid attempts are not audit-worthy at this volume.
