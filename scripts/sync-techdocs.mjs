#!/usr/bin/env node
/**
 * sync-techdocs.mjs
 *
 * Mirrors the public GitHub Pages documentation (the Astro/Starlight site under
 * `docs-site/src/content/docs/**`) into Backstage TechDocs format (MkDocs
 * markdown under `techdocs/**`) and (re)generates a matching `mkdocs.yml`.
 *
 * Why this exists
 * ---------------
 * We keep ONE canonical source of documentation — the Starlight content — which
 * ships to GitHub Pages. Backstage's TechDocs builder, however, consumes plain
 * MkDocs markdown, not Starlight MDX (it cannot execute the `<Aside>` / `<Card>`
 * / data-driven JSX components). This script is the bridge: it converts the MDX
 * to portable CommonMark, rewrites the `/SkillAi/...` site-absolute links into
 * relative `.md` links, and renders the one data-driven page
 * (`mcp-server/tools`) from the same `mcp-catalogue.json` the website uses.
 *
 * It is deterministic: same input -> same output, so CI can run it and commit
 * the diff (see `.github/workflows/techdocs.yml`).
 *
 * Pipeline ordering: run AFTER `docs-site` `docs:gen` so the auto-derived
 * content (OpenAPI / MCP catalogue / DB schema) exists before we mirror it.
 *
 * No external dependencies — Node stdlib only.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const SRC_DIR = resolve(REPO_ROOT, 'docs-site', 'src', 'content', 'docs')
const DATA_DIR = resolve(REPO_ROOT, 'docs-site', 'src', 'data')
const OUT_DIR = resolve(REPO_ROOT, 'techdocs')
const MKDOCS_YML = resolve(REPO_ROOT, 'mkdocs.yml')

const SITE_BASE = '/SkillAi' // Starlight `base` — stripped/rewritten for TechDocs

// ---------------------------------------------------------------------------
// Navigation — mirrors the Starlight sidebar in docs-site/astro.config.mjs.
// `autogenerate: { directory: X }` sections are expressed as { dir: 'X' } and
// globbed at build time so new pages appear automatically.
// ---------------------------------------------------------------------------
const NAV = [
  { label: 'Home', page: 'index' },
  {
    label: 'Overview',
    items: [
      ['What is SkillAI', 'overview/what-is-skillai'],
      ['Product tour', 'overview/product-tour'],
      ['Live demo', 'overview/live-demo'],
    ],
  },
  {
    label: 'Getting started',
    items: [
      ['Quick start', 'getting-started/quick-start'],
      ['Development workflow', 'getting-started/development'],
    ],
  },
  {
    label: 'Architecture',
    items: [
      ['System overview', 'architecture/system-overview'],
      ['Tech stack', 'architecture/tech-stack'],
      ['Multi-tenancy & RLS', 'architecture/multi-tenancy-rls'],
      ['AI scoring pipeline', 'architecture/ai-scoring-pipeline'],
      ['File storage', 'architecture/file-storage'],
      ['Performance baselines', 'architecture/performance'],
    ],
  },
  {
    label: 'REST API',
    items: [
      ['Overview', 'rest-api/overview'],
      ['Authentication', 'rest-api/authentication'],
      ['Rate limiting', 'rest-api/rate-limiting'],
      ['Endpoint reference', 'rest-api/endpoints'],
    ],
  },
  {
    label: 'MCP server',
    items: [
      ['Overview', 'mcp-server/overview'],
      ['Connecting from Claude Code', 'mcp-server/connecting'],
      ['Tool catalogue', 'mcp-server/tools'],
      ['Resources', 'mcp-server/resources'],
      ['Prompts', 'mcp-server/prompts'],
    ],
  },
  {
    label: 'Database',
    items: [
      ['Schema overview', 'database/overview'],
      { label: 'Table reference', dir: 'database/tables' },
    ],
  },
  { label: 'Code patterns', dir: 'code-patterns' },
  {
    label: 'Operations',
    items: [
      ['Kubernetes (k3d @ p510)', 'operations/k3d-p510-deploy'],
      ['AWS deployment', 'operations/aws-deploy'],
      ['Backup & recovery', 'operations/backup-runbook'],
      ['Health & monitoring', 'operations/health-monitoring'],
    ],
  },
  {
    label: 'Design decisions',
    items: [
      ['Index', 'decisions/index'],
      ['DEC-001 — Build vs buy', 'decisions/dec-001-build-vs-buy'],
      ['DEC-002 — Drizzle over Prisma', 'decisions/dec-002-drizzle-over-prisma'],
      ['DEC-003 — Row-Level Security', 'decisions/dec-003-row-level-security'],
      ['DEC-004 — Claude as primary AI', 'decisions/dec-004-claude-primary'],
      ['DEC-005 — Local storage + Garage', 'decisions/dec-005-storage'],
      ['DEC-006 — Auth.js over Clerk', 'decisions/dec-006-authjs-over-clerk'],
      ['DEC-007 — Manual transcript upload', 'decisions/dec-007-manual-transcript-upload'],
      ['DEC-008 — Manual archive on expiry', 'decisions/dec-008-manual-archive'],
      ['DEC-009 — Soft budget signal', 'decisions/dec-009-soft-budget-signal'],
      ['DEC-010 — Internal bench model', 'decisions/dec-010-internal-bench'],
      ['DEC-011 — GDPR erasure pattern', 'decisions/dec-011-gdpr-erasure'],
    ],
  },
  { label: 'Roadmap', page: 'roadmap' },
]

const ASIDE_LABEL = {
  note: 'ℹ️ Note',
  tip: '💡 Tip',
  caution: '⚠️ Caution',
  danger: '🚨 Danger',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(md|mdx)$/.test(entry)) out.push(full)
  }
  return out
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: raw }
  const fm = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\s*\n/, '')
  const data = {}
  // Minimal YAML — front-matter here is only flat `key: value` scalars.
  for (const line of fm.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return { data, body }
}

// The set of all output slugs (paths without extension), populated by main()
// before any transform runs, so links can be resolved against real files.
let SLUGS = new Set()

// Map a source content path to its TechDocs-relative slug (no extension).
function slugFor(absSrc) {
  return relative(SRC_DIR, absSrc).replace(/\\/g, '/').replace(/\.(md|mdx)$/, '')
}

// Resolve a /SkillAi/<target> site link to a relative .md link from `fromSlug`,
// or to an absolute GitHub Pages URL when no matching doc page exists.
function rewriteLink(fromSlug, target) {
  const clean = target.replace(/^\/+|\/+$/g, '')
  let toSlug = null
  if (clean === '') toSlug = 'index'
  else if (SLUGS.has(clean)) toSlug = clean
  else if (SLUGS.has(`${clean}/index`)) toSlug = `${clean}/index`
  else {
    // Section directory with no index page -> link to its first child.
    const kids = [...SLUGS].filter((s) => s.startsWith(`${clean}/`)).sort()
    if (kids.length) toSlug = kids[0]
  }
  if (toSlug === null) {
    // Unknown target (e.g. a static asset like openapi.json) -> keep it working
    // as an absolute link to the published GitHub Pages site.
    return { external: `https://olafkfreund.github.io/SkillAi/${clean}` }
  }
  const fromDir = fromSlug.includes('/') ? fromSlug.replace(/\/[^/]*$/, '') : ''
  let rel = relative(fromDir, `${toSlug}.md`).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return { rel }
}

function transformLinks(body, fromSlug) {
  // [text](/SkillAi/foo/bar/#anchor)  and bare /SkillAi/foo/bar
  return body.replace(
    /\]\(\s*\/SkillAi(\/[^)\s#]*)?(#[^)\s]*)?\s*\)/g,
    (_m, path = '', anchor = '') => {
      const r = rewriteLink(fromSlug, path || '')
      const href = r.rel ?? r.external
      // Anchors are only meaningful on internal pages we generated.
      return `](${href}${r.rel ? anchor || '' : ''})`
    },
  )
}

// Remove the common leading indentation shared by all non-empty lines of a
// block. MDX indents component children (often 2-4 spaces); left untouched that
// would render as Markdown code blocks. Dedenting by the shared minimum keeps
// any *intentional* relative indentation (nested lists, fenced code) intact.
function dedent(block) {
  const lines = block.replace(/^\n+|\n+$/g, '').split('\n')
  let min = Infinity
  for (const l of lines) {
    if (l.trim() === '') continue
    const m = l.match(/^[ \t]*/)
    min = Math.min(min, m[0].length)
  }
  if (!isFinite(min) || min === 0) return lines.join('\n')
  return lines.map((l) => l.slice(min)).join('\n')
}

function stripMdxComponents(body) {
  let out = body.replace(/^import\s.+$/gm, '')

  // Block transforms first — they dedent inner content so it renders as prose.
  // Aside -> labelled blockquote
  out = out.replace(
    /<Aside\s+type="([^"]+)"(?:\s+title="([^"]+)")?[^>]*>([\s\S]*?)<\/Aside>/g,
    (_m, type, title, inner) => {
      const label = ASIDE_LABEL[type] || 'ℹ️ Note'
      const head = title ? `${label} — ${title}` : label
      const quoted = dedent(inner)
        .split('\n')
        .map((l) => (l.length ? `> ${l}` : '>'))
        .join('\n')
      return `\n> **${head}**\n>\n${quoted}\n`
    },
  )
  out = out.replace(
    /<Aside[^>]*>([\s\S]*?)<\/Aside>/g,
    (_m, inner) => {
      const quoted = dedent(inner)
        .split('\n')
        .map((l) => (l.length ? `> ${l}` : '>'))
        .join('\n')
      return `\n> **ℹ️ Note**\n>\n${quoted}\n`
    },
  )
  // Card -> H3 with dedented body
  out = out.replace(
    /<Card\s+[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/Card>/g,
    (_m, title, inner) => `\n### ${title}\n\n${dedent(inner)}\n`,
  )
  // TabItem -> bold label with dedented body
  out = out.replace(
    /<TabItem\s+label="([^"]+)"[^>]*>([\s\S]*?)<\/TabItem>/g,
    (_m, label, inner) => `\n**${label}**\n\n${dedent(inner)}\n`,
  )

  return (
    out
      // structural wrappers that just vanish
      .replace(/<\/?Steps>/g, '')
      .replace(/<\/?CardGrid[^>]*>/g, '')
      .replace(/<\/?Tabs[^>]*>/g, '')
      // any unmatched stragglers
      .replace(/<\/?(Card|Aside|TabItem)[^>]*>/g, '')
      // Badge -> inline code
      .replace(/<Badge\s+[^>]*text="([^"]+)"[^>]*\/>/g, '`$1`')
      // Image -> drop (sources are JS imports, not portable URLs)
      .replace(/<Image\s+[^>]*\/>/g, '')
      // Any stray self-closing Starlight tag left over
      .replace(/<\/?(LinkCard|LinkButton|FileTree|Code)[^>]*>/g, '')
  )
}

function ensureHeading(body, data) {
  const hasH1 = /^#\s+/m.test(body.split('\n').slice(0, 8).join('\n'))
  let head = ''
  if (!hasH1 && data.title) head += `# ${data.title}\n\n`
  if (data.description) head += `_${data.description}_\n\n`
  return head + body
}

function tidy(body) {
  return body.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim() + '\n'
}

// ---------------------------------------------------------------------------
// Special-case: the one data-driven page (mcp-server/tools) is rendered from
// the same JSON catalogue the website uses, so the TechDocs table stays in
// lock-step with the live MCP tool registry.
// ---------------------------------------------------------------------------
function renderMcpToolsPage() {
  const jsonPath = resolve(DATA_DIR, 'mcp-catalogue.json')
  if (!existsSync(jsonPath)) {
    return '# Tool catalogue\n\n_MCP catalogue not generated. Run `npm run docs:gen` in `docs-site/` first._\n'
  }
  const cat = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const s = cat.summary
  let out = '# Tool catalogue\n\n'
  out += `_Every tool the SkillAI MCP server exposes — auto-generated from the live tool registry on ${cat.generatedAt}._\n\n`
  out += `> **ℹ️ Note** — This page is generated from \`docs-site/src/data/mcp-catalogue.json\` by \`scripts/sync-techdocs.mjs\`. Do not edit it by hand; re-run \`npm run techdocs:sync\`.\n\n`
  out += '## Summary\n\n'
  out += '| Metric | Count |\n|---|---|\n'
  out += `| Tools total | ${s.totalTools} |\n`
  out += `| Read tools | ${s.readTools} |\n`
  out += `| Write tools | ${s.writeTools} |\n`
  out += `| Modules | ${s.modules} |\n`
  out += `| Resources | ${s.resources} |\n`
  out += `| Prompts | ${s.prompts} |\n\n`
  for (const mod of cat.modules) {
    out += `## ${mod.name} (${mod.count})\n\n`
    out += '| Tool | Scope | Description |\n|---|---|---|\n'
    for (const t of mod.tools) {
      const desc = t.description.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
      out += `| \`${t.name}\` | ${t.scope} | ${desc} |\n`
    }
    out += '\n'
  }
  if (cat.resources?.length) {
    out += '## Resources\n\n| URI | Name | Description |\n|---|---|---|\n'
    for (const r of cat.resources) {
      out += `| \`${r.uri}\` | ${r.name} | ${r.description.replace(/\|/g, '\\|')} |\n`
    }
    out += '\n'
  }
  if (cat.prompts?.length) {
    out += '## Prompts\n\n| Name | Description |\n|---|---|\n'
    for (const p of cat.prompts) {
      out += `| \`${p.name}\` | ${p.description.replace(/\|/g, '\\|')} |\n`
    }
    out += '\n'
  }
  return tidy(out)
}

// ---------------------------------------------------------------------------
// Transform one source file -> markdown string
// ---------------------------------------------------------------------------
function transform(absSrc) {
  const slug = slugFor(absSrc)
  if (slug === 'mcp-server/tools') return renderMcpToolsPage()
  const raw = readFileSync(absSrc, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  let out = stripMdxComponents(body)
  out = transformLinks(out, slug)
  out = ensureHeading(out, data)
  return tidy(out)
}

// ---------------------------------------------------------------------------
// mkdocs.yml nav generation
// ---------------------------------------------------------------------------
function navToYaml(writtenSlugs) {
  const lines = ['nav:']
  const pageRef = (slug) => `${slug}.md`
  const has = (slug) => writtenSlugs.has(slug)

  for (const section of NAV) {
    if (section.page !== undefined) {
      if (has(section.page)) lines.push(`  - ${section.label}: ${pageRef(section.page)}`)
      continue
    }
    lines.push(`  - ${section.label}:`)
    const items = []
    if (section.dir) {
      // top-level autogenerate section
      for (const slug of [...writtenSlugs].filter((s) => s.startsWith(`${section.dir}/`)).sort()) {
        const title = slug.split('/').pop().replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
        items.push([title, slug])
      }
    } else {
      for (const item of section.items) {
        if (Array.isArray(item)) {
          if (has(item[1])) items.push(item)
        } else if (item.dir) {
          // nested autogenerate (e.g. database/tables)
          lines.push(`    - ${item.label}:`)
          for (const slug of [...writtenSlugs].filter((s) => s.startsWith(`${item.dir}/`)).sort()) {
            const title = slug.split('/').pop().replace(/-/g, ' ')
            lines.push(`      - ${title}: ${pageRef(slug)}`)
          }
        }
      }
    }
    for (const [title, slug] of items) {
      lines.push(`    - ${title.replace(/:/g, ' -')}: ${pageRef(slug)}`)
    }
  }
  return lines.join('\n')
}

function writeMkdocs(writtenSlugs) {
  const header = `# mkdocs.yml — Backstage TechDocs configuration for SkillAI.
#
# GENERATED FILE — do not edit by hand. Regenerate with: npm run techdocs:sync
# The nav + page content mirror the public GitHub Pages site (docs-site/).
# Backstage builds this via the TechDocs generator (techdocs-ref: dir:. in
# catalog-info.yaml), which runs \`mkdocs build\` against this repo.

site_name: SkillAI
site_description: Internal AI-powered recruiting portal — ranks candidates fast, archives them forever, integrates with Claude.
docs_dir: techdocs
repo_url: https://github.com/olafkfreund/SkillAi
edit_uri: edit/core-mvp-foundation/docs-site/src/content/docs/

theme:
  name: material

markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences
  - tables
  - toc:
      permalink: true

plugins:
  - techdocs-core

`
  writeFileSync(MKDOCS_YML, header + navToYaml(writtenSlugs) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`✗ Source docs not found: ${SRC_DIR}`)
    process.exit(1)
  }
  // Clean slate so deleted source pages don't linger in TechDocs.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const files = walk(SRC_DIR)
  // Pass 1: know every output slug up front so link resolution can target real
  // files (X.md vs X/index.md vs section dir) deterministically.
  SLUGS = new Set(files.map(slugFor))

  const writtenSlugs = new Set()
  for (const abs of files) {
    const slug = slugFor(abs)
    const outPath = resolve(OUT_DIR, `${slug}.md`)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, transform(abs), 'utf8')
    writtenSlugs.add(slug)
  }

  if (!writtenSlugs.has('index')) {
    writeFileSync(
      resolve(OUT_DIR, 'index.md'),
      '# SkillAI\n\nInternal AI-powered recruiting portal documentation.\n',
      'utf8',
    )
    writtenSlugs.add('index')
  }

  writeMkdocs(writtenSlugs)
  console.log(
    `✓ TechDocs synced: ${writtenSlugs.size} pages -> ${relative(REPO_ROOT, OUT_DIR)}${sep}, mkdocs.yml regenerated`,
  )
}

main()
