# MCP server overview

_SkillAI ships a built-in Model Context Protocol server at /api/mcp — 48 tools, 4 resources, 3 prompts, bearer-token auth, write-confirm semantics, full audit trail._

SkillAI ships a built-in **Model Context Protocol** server so Claude (and any other MCP-aware client) can drive the recruiting portal directly — list candidates, create roles, run scoring, send shortlists for approval, generate interview packs — without leaving the chat surface.

## What MCP is

MCP is Anthropic's open standard for exposing tools and data sources to large language models in a structured, discoverable, security-conscious way. It defines a JSON-RPC protocol for three primitives:

- **Tools** — function calls the LLM can invoke (read or write).
- **Resources** — URI-addressable read-only views the LLM can subscribe to.
- **Prompts** — pre-authored multi-step workflows the LLM can render into a conversation.

The reference SDK is published as `@modelcontextprotocol/sdk`. SkillAI uses v1.29.0 of that SDK, served over the streamable-HTTP transport.

## What SkillAI exposes


### 48 tools across 12 modules

Candidates, roles, agencies, customers, scoring, interviews, approvals, managers, notes, users, settings, exports. Full table at [Tool catalogue](./tools.md).


### 4 resources

Candidate, role (with ranked shortlist), interview pack, and "my shortlists" for hiring managers. See [Resources](./resources.md).


### 3 prompts

Prepare interview brief, weekly shortlist review, candidate introduction email. See [Prompts](./prompts.md).


### Bearer-token auth

Same tokens as REST — mint at Settings → API Tokens. See [Authentication](../rest-api/authentication.md).

## Endpoint and transport

The server is mounted at `POST /api/mcp` (also handles `GET` and `DELETE` for transport handshake messages). It runs **stateless** — each HTTP request validates its own bearer token, builds a fresh `McpServer` via [`buildMcpServer`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/lib/mcp/server.ts), dispatches the JSON-RPC payload, and closes. No session continuity across requests.

Tools, resources and prompts are wired up by [`registerAllTools`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/lib/mcp/tools/index.ts), `registerAllResources`, and `registerAllPrompts` respectively — each is a closure over the per-request `McpContext` (tenant, user, scopes, role), so handlers don't have to thread tenant context through the SDK's `args`.

```ts
// src/lib/mcp/server.ts
export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
  })
  registerAllTools(server, ctx)
  registerAllResources(server, ctx)
  registerAllPrompts(server, ctx)
  return server
}
```

## Auth and scope

Auth is identical to REST. The bearer token is validated, scoped, and rate-limited by the same code path the REST middleware uses — see [Authentication](../rest-api/authentication.md) for token format and scope inclusion rules, and [Rate limiting](../rest-api/rate-limiting.md) for the per-token / per-tenant / per-write sliding windows.

The MCP entry point at [`src/app/api/mcp/route.ts`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/api/mcp/route.ts) additionally resolves the user's **product role** (`admin` / `recruiter` / `hiring_manager` / `viewer`) once per request, so delegated server actions can enforce role-based gating on top of API-token scope.

## Write tools require explicit confirmation

Every write tool's input schema includes a `confirmed: z.literal(true)` field. The MCP client (Claude Code, claude-desktop) renders this as an inline prompt — the user must explicitly OK each state-changing call before the JSON-RPC request is sent. If `confirmed: true` is missing, the tool refuses to execute.

This sits *on top of* the token-scope check — a `write`-scoped token still needs human confirmation per call. The combination makes accidental destruction near-impossible from a Claude conversation.

```ts
// src/lib/mcp/tools/candidates.ts
export const UpdateStatusInput = {
  candidateId: z.string().uuid(),
  status: z.enum([...]),
  confirmed: z.literal(true).describe('Must be true. Write tools require explicit confirmation.'),
}
```

## Per-call audit

Every tool invocation writes an audit log row through the same `emitAudit` helper REST handlers use. Rate-limit rejections also emit `api.rate_limit_exceeded` with `{ via: 'mcp' }` in metadata so MCP-driven activity can be distinguished from REST in reporting.

> **💡 Tip**
>
> The audit log is the single source of truth for "what did the AI do to the data". Pull it for compliance reviews; export it via the GDPR-DSAR flow if a data subject requests it.

## Read vs write classification

The MCP entry point uses a name-prefix heuristic to decide whether a JSON-RPC call is a write for rate-limiting purposes:

```ts
return /^(update_|archive_|create_|delete_|deactivate_|approve_|reject_|rescore_|bulk_)/.test(toolName)
```

It deliberately errs on the side of `false` — a false negative under-counts writes (mild overage on the write ceiling), whereas a false positive would unfairly throttle reads. The full list of write-classified prefixes is in [`isLikelyWrite()`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/api/mcp/route.ts) at the top of the route file.

## Next steps

- [Connecting from Claude Code](./connecting.md) — the `claude mcp add` recipe and claude-desktop config.
- [Tool catalogue](./tools.md) — every tool, scope, and one-line description.
- [Resources](./resources.md) — the four URI-addressable read views.
- [Prompts](./prompts.md) — the three prebuilt multi-step workflows.
