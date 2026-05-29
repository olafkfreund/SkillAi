#!/usr/bin/env node
/**
 * Runs the existing AST-based MCP tool walker (scripts/generate-mcp-tools-doc.ts)
 * with the --json flag so we get a structured catalogue at:
 *   docs-site/src/content/data/mcp-catalogue.json
 *
 * The Starlight MCP pages consume that JSON to render the tool/resource/prompt
 * tables. The existing script also keeps emitting docs/mcp-tools.md as before.
 *
 * No DB, no network, no Anthropic SDK — the underlying walker is pure AST.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'generate-mcp-tools-doc.ts')
const JSON_OUT = resolve(__dirname, '..', 'src', 'data', 'mcp-catalogue.json')

if (!existsSync(SCRIPT)) {
  console.error(`✗ MCP doc generator missing at ${SCRIPT}`)
  process.exit(1)
}

const relJson = JSON_OUT.startsWith(REPO_ROOT) ? JSON_OUT.slice(REPO_ROOT.length + 1) : JSON_OUT

console.log(`→ Generating MCP catalogue via tsx (parent: ${REPO_ROOT})`)
try {
  execSync(`npx tsx scripts/generate-mcp-tools-doc.ts --json ${relJson}`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
} catch (err) {
  console.error('✗ MCP generator failed:', err.message)
  process.exit(1)
}

if (!existsSync(JSON_OUT)) {
  console.error(`✗ Expected output not found: ${JSON_OUT}`)
  process.exit(1)
}

const payload = JSON.parse(readFileSync(JSON_OUT, 'utf8'))
console.log(
  `✓ MCP catalogue: ${payload.summary.totalTools} tools (${payload.summary.readTools} read · ${payload.summary.writeTools} write) across ${payload.summary.modules} modules, ${payload.summary.resources} resources, ${payload.summary.prompts} prompts`
)
