#!/usr/bin/env bash
# Smoke test for skillai-mcp bridge.
# Usage: SKILLAI_TOKEN=skl_... bash scripts/smoke.sh
# Set SKILLAI_URL if not using http://localhost:3000 (default).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Guard ─────────────────────────────────────────────────────────────────────
if [ -z "${SKILLAI_TOKEN:-}" ]; then
  echo "SKIP: SKILLAI_TOKEN is not set. Provide it to run the smoke test."
  echo "  SKILLAI_TOKEN=skl_... bash scripts/smoke.sh"
  exit 0
fi

export SKILLAI_URL="${SKILLAI_URL:-http://localhost:3000}"
export SKILLAI_TOKEN

# ── Build ─────────────────────────────────────────────────────────────────────
echo ">>> Building TypeScript..."
cd "$ROOT_DIR"
npm run build 2>&1

BINARY="$ROOT_DIR/dist/index.js"
if [ ! -f "$BINARY" ]; then
  echo "FAIL: dist/index.js not found after build"
  exit 1
fi

# ── Send tools/list and validate inline ───────────────────────────────────────
FRAME='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

echo ">>> Sending tools/list to $SKILLAI_URL/api/mcp ..."

TMPOUT=$(mktemp)
trap 'rm -f "$TMPOUT"' EXIT

# Run bridge, capture stdout to file; stderr still goes to terminal
printf '%s\n' "$FRAME" | node "$BINARY" 2>/dev/null > "$TMPOUT"

if [ ! -s "$TMPOUT" ]; then
  echo "FAIL: bridge produced no output"
  exit 1
fi

# ── Validate via Node (reads from file, no shell-var truncation) ──────────────
node --input-type=module <<EOF 2>&1
import { readFileSync } from 'fs'
const raw = readFileSync('$TMPOUT', 'utf8').trim()
let parsed
try {
  parsed = JSON.parse(raw)
} catch (e) {
  console.error('FAIL: response is not valid JSON:', raw.slice(0, 300))
  process.exit(1)
}
if (parsed.error) {
  console.error('FAIL: JSON-RPC error response:', JSON.stringify(parsed.error, null, 2))
  process.exit(1)
}
const tools = parsed?.result?.tools
if (!Array.isArray(tools)) {
  console.error('FAIL: expected result.tools array, got:', JSON.stringify(parsed).slice(0, 300))
  process.exit(1)
}
console.log('PASS: received ' + tools.length + ' tool(s)')
tools.slice(0, 5).forEach((t) => console.log('  - ' + t.name))
if (tools.length > 5) console.log('  ... and ' + (tools.length - 5) + ' more')
EOF
