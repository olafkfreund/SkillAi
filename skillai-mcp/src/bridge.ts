import { createInterface } from 'readline'
import type { BridgeConfig } from './config.js'

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown
}

interface JsonRpcErrorObject {
  code: number
  message: string
  data?: unknown
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: JsonRpcErrorObject
}

function makeErrorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  }
}

function writeResponse(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

async function forwardFrame(
  config: BridgeConfig,
  rawLine: string,
): Promise<void> {
  let frame: JsonRpcRequest
  let id: JsonRpcId = null

  // Parse — never let a bad frame crash the process
  try {
    const parsed = JSON.parse(rawLine) as unknown
    if (typeof parsed !== 'object' || parsed === null) {
      throw new TypeError('frame must be a JSON object')
    }
    frame = parsed as JsonRpcRequest
    id = (frame as { id?: JsonRpcId }).id ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[skillai-mcp] Malformed JSON-RPC frame: ${msg}`)
    console.error(`[skillai-mcp] Raw input (first 200 chars): ${rawLine.slice(0, 200)}`)
    writeResponse(
      makeErrorResponse(null, -32700, 'Parse error', { received: rawLine.slice(0, 200) }),
    )
    return
  }

  const endpoint = `${config.url}/api/mcp`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(frame),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[skillai-mcp] Connection error to ${endpoint}: ${msg}`)
    writeResponse(
      makeErrorResponse(id, -32603, 'Transport error', { message: msg }),
    )
    return
  }

  // Handle HTTP-level errors with clear JSON-RPC error envelopes
  if (!response.ok) {
    const status = response.status
    let bodyText = ''
    try {
      bodyText = await response.text()
    } catch {
      // ignore body read failure
    }

    const httpErrorMap: Record<number, { code: number; message: string }> = {
      401: { code: -32001, message: 'Unauthorized: invalid or missing SKILLAI_TOKEN' },
      403: { code: -32001, message: 'Forbidden: token lacks required permissions' },
      429: { code: -32002, message: 'Rate limited: too many requests to SkillAi API' },
    }

    const mapped = httpErrorMap[status] ?? {
      code: -32603,
      message: `HTTP ${status} from SkillAi server`,
    }

    console.error(`[skillai-mcp] HTTP ${status} from ${endpoint}: ${bodyText.slice(0, 300)}`)
    writeResponse(makeErrorResponse(id, mapped.code, mapped.message, { status, body: bodyText.slice(0, 300) }))
    return
  }

  // Parse the response body
  let responseData: unknown
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('text/event-stream')) {
    // SSE stream — collect all data lines and parse the last complete JSON object
    try {
      const text = await response.text()
      const dataLines = text
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6).trim())
        .filter((l) => l.length > 0 && l !== '[DONE]')

      if (dataLines.length === 0) {
        console.error('[skillai-mcp] SSE stream had no data lines')
        writeResponse(makeErrorResponse(id, -32603, 'Empty SSE response from server'))
        return
      }

      // Use the last data line as the final response
      responseData = JSON.parse(dataLines[dataLines.length - 1]!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[skillai-mcp] Failed to parse SSE response: ${msg}`)
      writeResponse(makeErrorResponse(id, -32603, 'Invalid SSE response from server', { message: msg }))
      return
    }
  } else {
    // Standard JSON response
    try {
      responseData = await response.json()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[skillai-mcp] Failed to parse JSON response: ${msg}`)
      writeResponse(makeErrorResponse(id, -32603, 'Invalid JSON response from server', { message: msg }))
      return
    }
  }

  writeResponse(responseData)
}

export async function runBridge(config: BridgeConfig): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  // Process lines sequentially — MCP is request/response, ordering matters
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed === '') continue // skip blank lines
    await forwardFrame(config, trimmed)
  }

  // stdin closed cleanly — exit with success
  console.error('[skillai-mcp] stdin closed, exiting.')
  process.exit(0)
}
