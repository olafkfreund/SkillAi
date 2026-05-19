import { validateApiToken } from '@/lib/api-tokens/validate'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { emitAudit } from '@/lib/audit-middleware'
import type { ApiTokenScope } from '@/db/schema/api-tokens'

// Re-export for convenience
export type { ApiTokenScope }

export type AuthedContext<TParams = Record<string, string>> = {
  params: Promise<TParams>
  tenantId: string
  userId: string
  tokenId: string
  scopes: ApiTokenScope[]
}

export type AuthedHandler<TParams = Record<string, string>> = (
  req: Request,
  ctx: AuthedContext<TParams>
) => Promise<Response>

/**
 * requireScope — checks whether the granted scopes satisfy a required scope.
 *
 * Inclusion rules:
 *   admin  => satisfies read, write, admin
 *   write  => satisfies read, write
 *   read   => satisfies read only
 */
export function requireScope(required: ApiTokenScope, granted: ApiTokenScope[]): boolean {
  for (const scope of granted) {
    if (scope === 'admin') return true
    if (scope === 'write' && (required === 'write' || required === 'read')) return true
    if (scope === 'read' && required === 'read') return true
  }
  return false
}

function jsonError(status: number, error: string, code: string): Response {
  return Response.json({ error, code }, { status })
}

/**
 * withApiAuth — wraps a Next.js route handler with API token authentication,
 * scope enforcement, and rate-limiting.
 *
 * Steps:
 *   1. Extract Bearer token from Authorization header
 *   2. Validate the token (expiry, revocation, argon2 check)
 *   3. Check the token's scopes satisfy the requiredScope
 *   4. Run sliding-window rate limiter
 *   5. Call handler
 *   6. Catch unhandled errors → 500
 */
export function withApiAuth<TParams = Record<string, string>>(
  requiredScope: ApiTokenScope,
  handler: AuthedHandler<TParams>
): (req: Request, ctx: { params: Promise<TParams> }) => Promise<Response> {
  return async (req: Request, ctx: { params: Promise<TParams> }): Promise<Response> => {
    try {
      // Step 1: Extract Bearer token
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonError(401, 'unauthorized', 'no_token')
      }
      const rawToken = authHeader.slice(7).trim()
      if (!rawToken) {
        return jsonError(401, 'unauthorized', 'no_token')
      }

      // Step 2: Validate token
      const validated = await validateApiToken(rawToken)
      if (!validated) {
        return jsonError(401, 'unauthorized', 'invalid_token')
      }

      const { tenantId, userId, scopes, tokenId } = validated

      // Step 3: Scope check
      const scopeList = scopes as ApiTokenScope[]
      if (!requireScope(requiredScope, scopeList)) {
        return jsonError(403, 'forbidden', 'insufficient_scope')
      }

      // Step 4: Rate limit
      const isWrite = requiredScope !== 'read'
      const rateLimitResult = await checkRateLimit(tenantId, tokenId, isWrite)

      if (!rateLimitResult.ok) {
        const { retryAfter } = rateLimitResult
        // Audit rate limit exceeded
        emitAudit(tenantId, {
          action: 'api.rate_limit_exceeded',
          entityType: 'api_token',
          entityId: tokenId,
          metadata: { limit: rateLimitResult.limit, retryAfter },
        })

        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded', code: 'rate_limited' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': '60',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfter),
              'Retry-After': String(retryAfter),
            },
          }
        )
      }

      // Step 5: Call handler with enriched context
      return await handler(req, {
        params: ctx.params,
        tenantId,
        userId,
        tokenId,
        scopes: scopeList,
      })
    } catch (err) {
      // Step 6: Unhandled error fallback
      console.error('[withApiAuth] Unhandled error:', err)
      return jsonError(500, 'internal_error', 'unhandled')
    }
  }
}
