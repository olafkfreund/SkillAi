/**
 * MCP HTTP smoke test — exercises /api/mcp end-to-end with a bearer token.
 *
 * Asserts: auth gating, the three list endpoints (tools / resources / prompts),
 * counts match the generated catalogue, and at least one read tool round-trips
 * successfully. Mirrors the surface a Claude Code or claude-desktop client
 * would hit on initial connection.
 *
 * Usage:
 *   SKILLAI_TOKEN=skl_... npx tsx scripts/mcp-smoke.ts
 *   SKILLAI_URL=http://localhost:3000 SKILLAI_TOKEN=skl_... npx tsx scripts/mcp-smoke.ts
 *
 * Exit code 0 on all-pass, 1 on any failure.
 */

const SKILLAI_URL = process.env.SKILLAI_URL ?? 'http://localhost:3000'
const SKILLAI_TOKEN = process.env.SKILLAI_TOKEN ?? ''

const EXPECTED_TOOLS = 48
const EXPECTED_RESOURCES = 4
const EXPECTED_PROMPTS = 3

type JsonRpcResponse = {
  jsonrpc?: string
  id?: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

let pass = 0
let fail = 0

function ok(label: string): void {
  pass++
  console.log(`  PASS  ${label}`)
}
function bad(label: string, detail?: unknown): void {
  fail++
  console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ''}`)
}

async function rpc(
  body: Record<string, unknown>,
  authHeader?: string
): Promise<{ status: number; body: JsonRpcResponse | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (authHeader !== undefined) headers.Authorization = authHeader
  const res = await fetch(`${SKILLAI_URL}/api/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  let parsed: JsonRpcResponse | null = null
  try {
    parsed = (await res.json()) as JsonRpcResponse
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed }
}

const initParams = {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'skillai-mcp-smoke', version: '1.0' },
}

async function main(): Promise<void> {
  if (!SKILLAI_TOKEN) {
    console.error('SKILLAI_TOKEN env var is required.')
    console.error('Mint a token at /settings/api-tokens and re-run with:')
    console.error('  SKILLAI_TOKEN=skl_... npx tsx scripts/mcp-smoke.ts')
    process.exit(2)
  }

  console.log(`SkillAi MCP smoke test → ${SKILLAI_URL}/api/mcp`)
  console.log()

  // ── Auth gating ───────────────────────────────────────────────────────────
  console.log('Auth gating:')
  {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    if (r.status === 401) ok('rejects missing Authorization header (401)')
    else bad('expected 401 with no auth', { status: r.status, body: r.body })
  }
  {
    const r = await rpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      'Bearer skl_invalid_token_xxxxxxxxxxxxxxxxxxxx'
    )
    if (r.status === 401) ok('rejects invalid bearer token (401)')
    else bad('expected 401 with invalid token', { status: r.status, body: r.body })
  }

  const auth = `Bearer ${SKILLAI_TOKEN}`

  // ── initialize ────────────────────────────────────────────────────────────
  console.log()
  console.log('Protocol handshake:')
  {
    const r = await rpc(
      { jsonrpc: '2.0', id: 3, method: 'initialize', params: initParams },
      auth
    )
    if (r.status === 200 && r.body?.result) {
      ok('initialize returns a result object')
    } else {
      bad('initialize did not return 200 + result', { status: r.status, body: r.body })
    }
  }

  // ── Discovery ─────────────────────────────────────────────────────────────
  console.log()
  console.log('Discovery:')
  {
    const r = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} }, auth)
    const tools = (r.body?.result as { tools?: unknown[] } | undefined)?.tools
    if (Array.isArray(tools) && tools.length === EXPECTED_TOOLS) {
      ok(`tools/list returns ${tools.length} tools`)
    } else {
      bad(`tools/list mismatch (expected ${EXPECTED_TOOLS})`, {
        status: r.status,
        toolCount: Array.isArray(tools) ? tools.length : 'n/a',
        error: r.body?.error,
      })
    }
  }
  {
    const r = await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list', params: {} }, auth)
    const resources = (r.body?.result as { resources?: unknown[] } | undefined)?.resources
    const templates = (r.body?.result as { resourceTemplates?: unknown[] } | undefined)?.resourceTemplates
    const total = (resources?.length ?? 0) + (templates?.length ?? 0)
    if (total === EXPECTED_RESOURCES) {
      ok(`resources + resourceTemplates total ${total}`)
    } else {
      bad(`resources mismatch (expected ${EXPECTED_RESOURCES})`, {
        status: r.status,
        resources: resources?.length ?? 'n/a',
        templates: templates?.length ?? 'n/a',
        error: r.body?.error,
      })
    }
  }
  {
    const r = await rpc({ jsonrpc: '2.0', id: 6, method: 'prompts/list', params: {} }, auth)
    const prompts = (r.body?.result as { prompts?: unknown[] } | undefined)?.prompts
    if (Array.isArray(prompts) && prompts.length === EXPECTED_PROMPTS) {
      ok(`prompts/list returns ${prompts.length} prompts`)
    } else {
      bad(`prompts/list mismatch (expected ${EXPECTED_PROMPTS})`, {
        status: r.status,
        promptCount: Array.isArray(prompts) ? prompts.length : 'n/a',
        error: r.body?.error,
      })
    }
  }

  // ── Read tool round-trip ──────────────────────────────────────────────────
  console.log()
  console.log('Read tool round-trip:')
  {
    const r = await rpc(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'list_candidates', arguments: { limit: 5 } },
      },
      auth
    )
    if (r.status === 200 && r.body?.result && !r.body.error) {
      const content = (r.body.result as { content?: Array<{ type: string; text?: string }> }).content
      const text = content?.[0]?.text ?? ''
      const parsed = (() => { try { return JSON.parse(text) } catch { return null } })()
      const candidates = parsed?.candidates
      if (Array.isArray(candidates)) {
        ok(`list_candidates returned ${candidates.length} row(s)`)
      } else {
        bad('list_candidates returned non-array result', { content })
      }
    } else {
      bad('list_candidates failed', { status: r.status, error: r.body?.error })
    }
  }

  // ── Write-without-confirmation rejection ──────────────────────────────────
  console.log()
  console.log('Confirmation gating:')
  {
    const r = await rpc(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'archive_candidate',
          arguments: { candidateId: '00000000-0000-0000-0000-000000000000' },
        },
      },
      auth
    )
    // The tool should reject pre-DB because `confirmed: true` is missing.
    // SDK will return a tool-level error in result.isError or in body.error.
    const result = r.body?.result as
      | { isError?: boolean; content?: Array<{ text?: string }> }
      | undefined
    const text = result?.content?.[0]?.text ?? ''
    if (
      result?.isError === true ||
      r.body?.error ||
      text.toLowerCase().includes('confirm') ||
      text.toLowerCase().includes('required')
    ) {
      ok('archive_candidate without confirmed:true is rejected')
    } else {
      bad('archive_candidate without confirmed should reject', { status: r.status, body: r.body })
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log()
  console.log(`Result: ${pass} pass, ${fail} fail`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Smoke test crashed:', err)
  process.exit(1)
})
