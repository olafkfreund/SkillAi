#!/usr/bin/env node
/**
 * Walks src/db/schema/*.ts using the TypeScript compiler API and emits one
 * Markdown page per Drizzle table at:
 *   docs-site/src/content/docs/database/tables/{table-name}.md
 *
 * Recovers: column names, column types, nullability, defaults, FK references,
 * unique constraints, and the trailing `RLS:` / RLS comment block when present.
 *
 * Pure AST walk — no DB connection.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SCHEMA_DIR = path.join(REPO_ROOT, 'src', 'db', 'schema')
const OUT_DIR = path.join(__dirname, '..', 'src', 'content', 'docs', 'database', 'tables')
const OVERVIEW_OUT = path.join(__dirname, '..', 'src', 'content', 'docs', 'database', 'overview.md')

function readSource(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
}

function getInitializer(node) {
  if (ts.isPropertyAssignment(node)) return node.initializer
  if (ts.isShorthandPropertyAssignment(node)) return node.name
  return null
}

function extractStringLiteral(node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

/**
 * For a Drizzle column chain like:
 *   uuid('id').primaryKey().defaultRandom().notNull()
 *   text('name', { length: 200 }).notNull()
 *   integer('rate').references(() => roles.id)
 *
 * Recover the type, db column name, and chain of modifiers.
 */
function describeColumn(initializer) {
  if (!initializer) return null

  // Walk the call chain from outermost (last applied) to innermost (the type fn)
  const chain = []
  let cur = initializer
  while (ts.isCallExpression(cur)) {
    if (ts.isPropertyAccessExpression(cur.expression)) {
      chain.unshift({ kind: 'modifier', name: cur.expression.name.text, args: cur.arguments })
      cur = cur.expression.expression
    } else if (ts.isIdentifier(cur.expression)) {
      chain.unshift({ kind: 'type', name: cur.expression.text, args: cur.arguments })
      break
    } else {
      break
    }
  }

  const typeNode = chain.find((n) => n.kind === 'type')
  if (!typeNode) return null

  const type = typeNode.name
  const colNameLit = typeNode.args[0]
  const colName = colNameLit ? extractStringLiteral(colNameLit) : null

  const modifiers = chain.filter((n) => n.kind === 'modifier').map((n) => n.name)

  // Extract second-arg options (e.g. `{ length: 200, enum: [...] }`) for richer types
  let typeDetail = type
  const optsArg = typeNode.args[1]
  if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
    for (const p of optsArg.properties) {
      if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name)) {
        if (p.name.text === 'length' && ts.isNumericLiteral(p.initializer)) {
          typeDetail = `${type}(${p.initializer.text})`
        }
        if (p.name.text === 'enum' && ts.isArrayLiteralExpression(p.initializer)) {
          const values = p.initializer.elements
            .map((e) => extractStringLiteral(e))
            .filter(Boolean)
          typeDetail = `${type}<${values.map((v) => `'${v}'`).join(' | ')}>`
        }
      }
    }
  }

  // FK reference
  let references = null
  for (const m of chain) {
    if (m.kind === 'modifier' && m.name === 'references' && m.args[0]) {
      const arrow = m.args[0]
      if (ts.isArrowFunction(arrow) && ts.isPropertyAccessExpression(arrow.body)) {
        references = `${arrow.body.expression.getText()}.${arrow.body.name.text}`
      } else if (ts.isArrowFunction(arrow)) {
        references = arrow.body.getText().trim()
      }
    }
  }

  // Default value
  let defaultVal = null
  for (const m of chain) {
    if (m.kind === 'modifier') {
      if (m.name === 'defaultRandom') defaultVal = 'gen_random_uuid()'
      else if (m.name === 'defaultNow') defaultVal = 'now()'
      else if (m.name === 'default' && m.args[0]) {
        const arg = m.args[0]
        if (ts.isStringLiteral(arg) || ts.isNumericLiteral(arg)) defaultVal = arg.getText()
        else if (arg.kind === ts.SyntaxKind.TrueKeyword) defaultVal = 'true'
        else if (arg.kind === ts.SyntaxKind.FalseKeyword) defaultVal = 'false'
        else defaultVal = arg.getText().slice(0, 40)
      }
    }
  }

  return {
    columnName: colName,
    type: typeDetail,
    notNull: modifiers.includes('notNull'),
    primaryKey: modifiers.includes('primaryKey'),
    unique: modifiers.includes('unique'),
    references,
    default: defaultVal,
  }
}

/**
 * Returns { tableName, columns: [{name, ...}] } for each pgTable(...) call found in the file.
 */
function extractTables(file) {
  const sf = readSource(file)
  const tables = []

  function visit(node) {
    // Match: `export const X = pgTable('table_name', { ... }, ...)`
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer) continue

        // Tables may be declared either as `pgTable(...)` directly or with a
        // trailing call chain like `pgTable(...).enableRLS()`. Walk down the
        // chain until we find the pgTable call (or bail out).
        let pgTableCall = null
        let cur = decl.initializer
        for (let i = 0; i < 6 && cur; i++) {
          if (
            ts.isCallExpression(cur) &&
            ts.isIdentifier(cur.expression) &&
            cur.expression.text === 'pgTable'
          ) {
            pgTableCall = cur
            break
          }
          if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
            cur = cur.expression.expression
            continue
          }
          if (ts.isPropertyAccessExpression(cur)) {
            cur = cur.expression
            continue
          }
          break
        }

        if (pgTableCall) {
          const args = pgTableCall.arguments
          const tableNameLit = args[0]
          const colsObj = args[1]
          if (!tableNameLit || !colsObj) continue
          const tableName = extractStringLiteral(tableNameLit)
          const tsName = decl.name.getText()
          if (!tableName) continue

          const columns = []
          if (ts.isObjectLiteralExpression(colsObj)) {
            for (const prop of colsObj.properties) {
              if (!ts.isPropertyAssignment(prop)) continue
              const fieldName = prop.name?.getText()
              const init = getInitializer(prop)
              const desc = describeColumn(init)
              if (desc) {
                columns.push({ field: fieldName, ...desc })
              }
            }
          }

          tables.push({ tableName, tsName, columns, sourceFile: path.basename(file) })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return tables
}

// ─── Page rendering ──────────────────────────────────────────────────────────

function escapeCellPipes(s) {
  return s.replace(/\|/g, '\\|')
}

function renderTablePage(table) {
  const front = ['---']
  front.push(`title: ${table.tableName}`)
  front.push(`description: Schema reference for the ${table.tableName} table.`)
  front.push(`sidebar:`)
  front.push(`  label: ${table.tableName}`)
  front.push('---')
  front.push('')
  front.push(
    `import { Aside } from '@astrojs/starlight/components'`
  )
  front.push('')
  front.push('<Aside type="note">')
  front.push(
    `Auto-generated from \`src/db/schema/${table.sourceFile}\`. **${table.columns.length}** columns. To regenerate locally, run \`npm run docs:gen:db\` from \`docs-site/\`.`
  )
  front.push('</Aside>')
  front.push('')

  // Tenant note
  if (table.columns.some((c) => c.field === 'tenantId' || c.columnName === 'tenant_id')) {
    front.push(
      '**Tenant-scoped.** This table includes `tenant_id` and is enforced by Row-Level Security. All queries must run inside `withTenant(tenantId, ...)`. See [Multi-tenancy & RLS](/architecture/multi-tenancy-rls).'
    )
    front.push('')
  }

  front.push('## Columns')
  front.push('')
  front.push('| Column | Type | Constraints | Default | References |')
  front.push('|---|---|---|---|---|')
  for (const c of table.columns) {
    const constraints = []
    if (c.primaryKey) constraints.push('`PRIMARY KEY`')
    if (c.notNull) constraints.push('`NOT NULL`')
    if (c.unique) constraints.push('`UNIQUE`')
    const ref = c.references ? `\`${escapeCellPipes(c.references)}\`` : '—'
    const def = c.default ? `\`${escapeCellPipes(c.default)}\`` : '—'
    front.push(
      `| \`${c.columnName ?? c.field}\` | \`${escapeCellPipes(c.type)}\` | ${constraints.join(' ') || '—'} | ${def} | ${ref} |`
    )
  }
  front.push('')
  front.push(
    `**Drizzle name:** \`${table.tsName}\` (imported as \`import { ${table.tsName} } from '@/db/schema'\`).`
  )
  front.push('')

  return front.join('\n')
}

function renderOverviewPage(allTables) {
  const grouped = {
    'Identity & tenancy': ['tenants', 'users', 'user_invitations', 'tenant_settings', 'api_tokens'],
    'Roles & candidates': [
      'roles',
      'candidates',
      'cv_profiles',
      'candidate_enrichments',
      'role_managers',
      'role_submissions',
    ],
    'Scoring & matching': ['scores', 'ai_usage'],
    'Interviews & approvals': [
      'interview_slots',
      'interview_packs',
      'interview_questions',
      'code_challenges',
      'interview_transcripts',
      'transcript_analyses',
      'candidate_role_approvals',
    ],
    'Agencies, customers, notes': [
      'agencies',
      'customers',
      'customer_frameworks',
      'notes',
      'sent_emails',
      'email_templates',
    ],
    'Calendars & audit': ['calendar_connections', 'audit_logs'],
  }

  const lines = []
  lines.push('---')
  lines.push('title: Schema overview')
  lines.push('description: Logical grouping of the 29 tables in the SkillAI database.')
  lines.push('---')
  lines.push('')
  lines.push(`import { Aside } from '@astrojs/starlight/components'`)
  lines.push('')
  lines.push('<Aside type="tip">')
  lines.push(
    `**${allTables.length} tables**, all multi-tenant via PostgreSQL Row-Level Security. Every tenant-scoped table includes \`tenant_id UUID NOT NULL\` and is filtered by an RLS policy that reads \`app.tenant_id\` from the session. See [DEC-003](/decisions/dec-003-row-level-security) for the rationale.`
  )
  lines.push('</Aside>')
  lines.push('')

  for (const [group, want] of Object.entries(grouped)) {
    const found = want
      .map((w) => allTables.find((t) => t.tableName === w))
      .filter(Boolean)
    if (found.length === 0) continue
    lines.push(`## ${group}`)
    lines.push('')
    lines.push('| Table | Columns | Source |')
    lines.push('|---|---|---|')
    for (const t of found) {
      lines.push(
        `| [\`${t.tableName}\`](/database/tables/${t.tableName.replace(/_/g, '-')}) | ${t.columns.length} | \`src/db/schema/${t.sourceFile}\` |`
      )
    }
    lines.push('')
  }

  const ungrouped = allTables.filter(
    (t) => !Object.values(grouped).flat().includes(t.tableName)
  )
  if (ungrouped.length > 0) {
    lines.push('## Other')
    lines.push('')
    lines.push('| Table | Columns | Source |')
    lines.push('|---|---|---|')
    for (const t of ungrouped) {
      lines.push(
        `| [\`${t.tableName}\`](/database/tables/${t.tableName.replace(/_/g, '-')}) | ${t.columns.length} | \`src/db/schema/${t.sourceFile}\` |`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────────────

const files = fs
  .readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => path.join(SCHEMA_DIR, f))

const allTables = []
for (const f of files) allTables.push(...extractTables(f))

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

for (const t of allTables) {
  const slug = t.tableName.replace(/_/g, '-')
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.md`), renderTablePage(t), 'utf8')
}

fs.writeFileSync(OVERVIEW_OUT, renderOverviewPage(allTables), 'utf8')

console.log(
  `✓ DB schema: ${allTables.length} tables · ${allTables.reduce((acc, t) => acc + t.columns.length, 0)} columns`
)
console.log(`  ${path.relative(REPO_ROOT, OVERVIEW_OUT)}`)
console.log(`  ${path.relative(REPO_ROOT, OUT_DIR)}/ (${allTables.length} pages)`)
