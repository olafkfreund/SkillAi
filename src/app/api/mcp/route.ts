/**
 * MCP HTTP endpoint — `/api/mcp`.
 *
 * Exposes SkillAi tools/resources/prompts to claude-desktop (and any other
 * MCP-aware client) over the streamable-HTTP transport. Stateless mode:
 * each request validates its own bearer token, runs the corresponding
 * tool, and closes. No session continuity is kept across requests.
 *
 * Auth flow on every request:
 *   1. Extract `Authorization: Bearer <token>` (return 401 if missing).
 *   2. Validate the token via `validateApiToken` (return 401 if bad).
 *   3. Look up the user's product-role (admin/recruiter/...) so that
 *      delegated server actions can enforce role-based gating.
 *   4. Rate-limit via `checkRateLimit` (return 429 if exceeded).
 *   5. Build a per-request `McpServer`, connect it to a fresh
 *      `WebStandardStreamableHTTPServerTransport`, and let the SDK
 *      dispatch the JSON-RPC body to the matching tool/resource/prompt.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { validateApiToken } from '@/lib/api-tokens/validate'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { emitAudit } from '@/lib/audit-middleware'
import { buildMcpServer } from '@/lib/mcp/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { ApiTokenScope } from '@/db/schema/api-tokens'
import type { UserRole } from '@/lib/auth/types'

export const runtime = 'nodejs'
// Disable static optimisation — this route always runs per-request.
export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: status === 401 ? -32001 : status === 403 ? -32002 : -32000, message },
      id: null,
      _http: { status, code },
    },
    { status }
  )
}

/**
 * Heuristic that looks at a parsed JSON-RPC body to decide whether the
 * call is a "write" for rate-limiting purposes. Tool calls that modify
 * state are usually `tools/call` with a method name we recognise;
 * everything else (tools/list, resources/read, prompts/get) is a read.
 *
 * We err on the side of `false` — false negatives just give a slightly
 * higher per-tenant ceiling on writes than intended; false positives
 * would unfairly throttle reads.
 */
function isLikelyWrite(parsed: unknown): boolean {
  const body = parsed as { method?: string; params?: { name?: string; arguments?: unknown } } | null
  if (!body) return false
  if (body.method !== 'tools/call') return false
  const toolName = body.params?.name ?? ''
  // Match the write tool names registered in src/lib/mcp/tools/*.
  return /^(update_|archive_|create_|delete_|deactivate_|approve_|reject_|rescore_|bulk_)/.test(toolName)
}

async function handle(req: Request): Promise<Response> {
  // -- 1. Bearer token ---------------------------------------------------------
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonError(401, 'no_token', 'Missing Authorization: Bearer header')
  }
  const rawToken = authHeader.slice(7).trim()
  if (!rawToken) {
    return jsonError(401, 'no_token', 'Empty bearer token')
  }

  // -- 2. Validate token -------------------------------------------------------
  const validated = await validateApiToken(rawToken)
  if (!validated) {
    return jsonError(401, 'invalid_token', 'Token is invalid, expired, or revoked')
  }
  const { tenantId, userId, scopes, tokenId } = validated
  const scopeList = scopes as ApiTokenScope[]

  // -- 3. Resolve user role for action-context delegation ----------------------
  // Server actions read userRole from the ActionContext to gate writes.
  // We look it up once per MCP request rather than embedding it in the token.
  let userRole: UserRole = 'viewer'
  try {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (row?.role) userRole = row.role as UserRole
  } catch (err) {
    console.error('[mcp] failed to resolve user role; defaulting to viewer:', err)
  }

  // -- 4. Body parse + rate limit ---------------------------------------------
  // We have to read the body once (rate-limit decision) and replay it to the
  // SDK transport — the request stream is one-shot, so the transport receives
  // a parsedBody hint instead of the original Request.
  let parsedBody: unknown = null
  if (req.method === 'POST') {
    try {
      parsedBody = await req.clone().json()
    } catch {
      // Non-JSON POST; SDK will reject. Treat as read for rate-limit purposes.
      parsedBody = null
    }
  }

  const isWrite = isLikelyWrite(parsedBody)
  const rateLimit = await checkRateLimit(tenantId, tokenId, isWrite)
  if (!rateLimit.ok) {
    emitAudit(tenantId, {
      action: 'api.rate_limit_exceeded',
      entityType: 'api_token',
      entityId: tokenId,
      metadata: { limit: rateLimit.limit, retryAfter: rateLimit.retryAfter, via: 'mcp' },
    })
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'rate_limit_exceeded' },
        id: null,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + rateLimit.retryAfter),
        },
      }
    )
  }

  // -- 5. Build MCP server + dispatch ------------------------------------------
  try {
    const ctx = { tenantId, userId, tokenId, scopes: scopeList, userRole }
    const server = buildMcpServer(ctx)

    // Stateless mode — sessionIdGenerator omitted. JSON response mode is on
    // for simplicity: claude-desktop handles both, and JSON is much easier
    // to debug in the early iterations of this adapter.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)

    // Pass the parsed body so the SDK doesn't try to re-read the consumed stream.
    return await transport.handleRequest(req, {
      parsedBody: parsedBody ?? undefined,
    })
  } catch (err) {
    console.error('[mcp] handler error:', err)
    return jsonError(
      500,
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected MCP handler error'
    )
  }
}

export const POST = handle
export const GET = handle
export const DELETE = handle
