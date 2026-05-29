#!/usr/bin/env node
/**
 * Generates the OpenAPI snapshot for the docs site by invoking a small tsx
 * shim in the parent repo. The shim sets stub env vars, imports every
 * route file that calls registerRoute(), then dumps getOpenApiDocument().
 *
 * Outputs:
 *   docs-site/public/openapi.json                 — raw OpenAPI 3.1 spec
 *   docs-site/src/content/data/openapi.json       — same, as a content-collection
 *                                                   data file the page imports
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SHIM = resolve(__dirname, 'shim-openapi-dump.ts')
const PUBLIC_OUT = resolve(__dirname, '..', 'public', 'openapi.json')
const DATA_OUT = resolve(__dirname, '..', 'src', 'data', 'openapi.json')

if (!existsSync(SHIM)) {
  console.error(`✗ Shim missing at ${SHIM} — re-run scaffold.`)
  process.exit(1)
}

console.log(`→ Generating OpenAPI snapshot (parent: ${REPO_ROOT})`)

try {
  // The shim writes to PUBLIC_OUT directly when given the path as argv[2].
  // Run from REPO_ROOT so that @/ path aliases (configured in tsconfig.json) resolve.
  execSync(`npx tsx ${relative(REPO_ROOT, SHIM)} ${relative(REPO_ROOT, PUBLIC_OUT)}`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Stub env so importing route files doesn't crash on missing config.
      // The postgres driver is lazy — these credentials are never used because
      // we never run a query, only collect registry entries at import time.
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'docs-site-build-stub-secret-not-used',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'docs-site-build-stub-secret-not-used',
      SKIP_ENV_VALIDATION: '1',
      NODE_ENV: 'production',
    },
  })
} catch (err) {
  console.error('✗ OpenAPI generator failed:', err.message)
  process.exit(1)
}

if (!existsSync(PUBLIC_OUT)) {
  console.error(`✗ Expected output not found: ${PUBLIC_OUT}`)
  process.exit(1)
}

// Mirror the same JSON into the content directory so the MDX page can import it.
mkdirSync(dirname(DATA_OUT), { recursive: true })
copyFileSync(PUBLIC_OUT, DATA_OUT)

const spec = JSON.parse(readFileSync(PUBLIC_OUT, 'utf8'))
const pathCount = Object.keys(spec.paths ?? {}).length
const opCount = Object.values(spec.paths ?? {}).reduce(
  (acc, p) => acc + Object.keys(p ?? {}).length,
  0
)

// Generate the Markdown endpoint reference page alongside the JSON.
const endpointPage = renderEndpointPage(spec)
const ENDPOINT_MD = resolve(__dirname, '..', 'src', 'content', 'docs', 'rest-api', 'endpoints.md')
mkdirSync(dirname(ENDPOINT_MD), { recursive: true })
writeFileSync(ENDPOINT_MD, endpointPage, 'utf8')

console.log(`✓ OpenAPI: ${pathCount} paths · ${opCount} operations`)
console.log(`  ${relative(REPO_ROOT, PUBLIC_OUT)}`)
console.log(`  ${relative(REPO_ROOT, DATA_OUT)}`)
console.log(`  ${relative(REPO_ROOT, ENDPOINT_MD)}`)

// ─── Page renderer ─────────────────────────────────────────────────────────

function renderEndpointPage(spec) {
  const groups = {}
  for (const [pathStr, ops] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(ops ?? {})) {
      const tag = (op.tags && op.tags[0]) || 'general'
      if (!groups[tag]) groups[tag] = []
      groups[tag].push({ method: method.toUpperCase(), path: pathStr, ...op })
    }
  }
  const tagOrder = Object.keys(groups).sort()

  const lines = []
  lines.push('---')
  lines.push('title: Endpoint reference')
  lines.push(
    'description: Auto-generated REST endpoint reference for SkillAI. All endpoints require a Bearer API token.'
  )
  lines.push('tableOfContents:')
  lines.push('  minHeadingLevel: 2')
  lines.push('  maxHeadingLevel: 3')
  lines.push('---')
  lines.push('')
  lines.push(
    `import { Aside } from '@astrojs/starlight/components'`
  )
  lines.push('')
  lines.push('<Aside type="note">')
  lines.push(
    `This page is **auto-generated** from the source-of-truth OpenAPI document. To regenerate locally, run \`npm run docs:gen:openapi\` from \`docs-site/\`. Last generated: **${new Date().toISOString().slice(0, 10)}**.`
  )
  lines.push('</Aside>')
  lines.push('')
  lines.push(
    `**${Object.keys(spec.paths).length} paths**, **${opCount} operations**. Download the raw spec: [openapi.json](/SkillAi/openapi.json).`
  )
  lines.push('')
  lines.push(
    'All endpoints require an `Authorization: Bearer skl_<env>_<token>` header. See [Authentication](/rest-api/authentication) for details.'
  )
  lines.push('')

  for (const tag of tagOrder) {
    const ops = groups[tag].sort((a, b) =>
      a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
    )
    lines.push(`## ${tag}`)
    lines.push('')
    lines.push('| Method | Path | Scope | Summary |')
    lines.push('|---|---|---|---|')
    for (const op of ops) {
      const scope =
        op.description && op.description.includes('admin')
          ? 'admin'
          : op.description && op.description.includes('write')
            ? 'write'
            : 'read'
      const summary = (op.summary || '').replace(/\|/g, '\\|')
      lines.push(
        `| \`${op.method}\` | \`${op.path}\` | \`${scope}\` | ${summary} |`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
