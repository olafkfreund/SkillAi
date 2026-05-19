/**
 * Generates docs/mcp-tools.md from src/lib/mcp/tools/*.ts.
 *
 * Walks each tool module's AST, extracts every `server.registerTool(...)` call,
 * and pairs it with the inner `runTool(ctx, name, scope, isWrite, ...)` call
 * to recover the required scope and write flag.
 *
 * Run: npx tsx scripts/generate-mcp-tools-doc.ts
 *      (or via the npm script: npm run docs:mcp-tools)
 *
 * The generator is read-only against source. It overwrites docs/mcp-tools.md.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'

type Scope = 'read' | 'write' | 'admin'

type ToolEntry = {
  module: string
  name: string
  title: string
  description: string
  scope: Scope
  isWrite: boolean
}

const TOOLS_DIR = path.join(process.cwd(), 'src', 'lib', 'mcp', 'tools')
const RESOURCES_FILE = path.join(process.cwd(), 'src', 'lib', 'mcp', 'resources', 'index.ts')
const PROMPTS_FILE = path.join(process.cwd(), 'src', 'lib', 'mcp', 'prompts', 'index.ts')
const OUTPUT = path.join(process.cwd(), 'docs', 'mcp-tools.md')

// ─── AST helpers ────────────────────────────────────────────────────────────

function readSource(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS
  )
}

/** Concatenates literal/template string nodes joined with `+`. Returns null on non-strings. */
function flattenStringExpression(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = flattenStringExpression(node.left)
    const right = flattenStringExpression(node.right)
    if (left === null || right === null) return null
    return left + right
  }
  return null
}

function isCallTo(node: ts.Node, propertyName: string): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  return ts.isPropertyAccessExpression(callee) && callee.name.text === propertyName
}

function isPlainCallTo(node: ts.Node, identifierName: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === identifierName
  )
}

/** Finds the first `runTool(...)` call inside an arrow function expression. */
function findRunToolCall(arrow: ts.ArrowFunction): ts.CallExpression | null {
  let found: ts.CallExpression | null = null
  function walk(n: ts.Node) {
    if (found) return
    if (isPlainCallTo(n, 'runTool')) {
      found = n
      return
    }
    ts.forEachChild(n, walk)
  }
  walk(arrow.body)
  return found
}

function extractToolFromCall(call: ts.CallExpression, moduleName: string): ToolEntry | null {
  if (call.arguments.length < 3) return null
  const [nameArg, configArg, handlerArg] = call.arguments

  const name = flattenStringExpression(nameArg)
  if (!name) return null

  if (!ts.isObjectLiteralExpression(configArg)) return null

  let title = ''
  let description = ''
  for (const prop of configArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue
    const key = ts.isIdentifier(prop.name) ? prop.name.text : null
    if (key === 'title') title = flattenStringExpression(prop.initializer) ?? ''
    if (key === 'description') description = flattenStringExpression(prop.initializer) ?? ''
  }

  if (!ts.isArrowFunction(handlerArg)) return null
  const runTool = findRunToolCall(handlerArg)
  if (!runTool || runTool.arguments.length < 4) return null

  const scopeArg = runTool.arguments[2]
  const isWriteArg = runTool.arguments[3]

  const scope = flattenStringExpression(scopeArg) as Scope | null
  if (scope !== 'read' && scope !== 'write' && scope !== 'admin') return null

  let isWrite = false
  if (isWriteArg.kind === ts.SyntaxKind.TrueKeyword) isWrite = true
  else if (isWriteArg.kind === ts.SyntaxKind.FalseKeyword) isWrite = false

  return { module: moduleName, name, title, description, scope, isWrite }
}

function collectToolsFromFile(file: string): ToolEntry[] {
  const moduleName = path.basename(file, '.ts')
  const sf = readSource(file)
  const tools: ToolEntry[] = []

  function visit(node: ts.Node) {
    if (isCallTo(node, 'registerTool')) {
      const tool = extractToolFromCall(node, moduleName)
      if (tool) tools.push(tool)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return tools
}

// ─── Resources & prompts (lighter parsing — title + uri/name only) ─────────

type ResourceEntry = { uri: string; name: string; description: string }
type PromptEntry = { name: string; description: string }

function collectResources(file: string): ResourceEntry[] {
  const sf = readSource(file)
  const out: ResourceEntry[] = []

  function visit(node: ts.Node) {
    if (isCallTo(node, 'registerResource') || isCallTo(node, 'registerResourceTemplate')) {
      const args = (node as ts.CallExpression).arguments
      const name = args[0] && flattenStringExpression(args[0])
      // Resource URI is in arg[1] for registerResource (string literal),
      // or in arg[1].uriTemplate for registerResourceTemplate.
      let uri = ''
      let description = ''
      if (args[1]) {
        const fromString = flattenStringExpression(args[1])
        if (fromString) {
          uri = fromString
        } else if (ts.isNewExpression(args[1])) {
          const tplArg = args[1].arguments?.[0]
          if (tplArg) uri = flattenStringExpression(tplArg) ?? ''
        }
      }
      if (args[2] && ts.isObjectLiteralExpression(args[2])) {
        for (const prop of args[2].properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'description'
          ) {
            description = flattenStringExpression(prop.initializer) ?? ''
          }
        }
      }
      if (name) out.push({ uri: uri || name, name, description })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function collectPrompts(file: string): PromptEntry[] {
  const sf = readSource(file)
  const out: PromptEntry[] = []

  function visit(node: ts.Node) {
    if (isCallTo(node, 'registerPrompt')) {
      const args = (node as ts.CallExpression).arguments
      const name = args[0] && flattenStringExpression(args[0])
      let description = ''
      if (args[1] && ts.isObjectLiteralExpression(args[1])) {
        for (const prop of args[1].properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'description'
          ) {
            description = flattenStringExpression(prop.initializer) ?? ''
          }
        }
      }
      if (name) out.push({ name, description })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

// ─── Markdown rendering ────────────────────────────────────────────────────

function squish(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function escapeCellPipes(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function renderToolsTable(tools: ToolEntry[]): string {
  const byModule = new Map<string, ToolEntry[]>()
  for (const t of tools) {
    const list = byModule.get(t.module) ?? []
    list.push(t)
    byModule.set(t.module, list)
  }

  const moduleOrder = [
    'candidates',
    'roles',
    'agencies',
    'customers',
    'scoring',
    'interviews',
    'approvals',
    'managers',
    'notes',
    'users',
    'settings',
    'exports',
  ]

  const lines: string[] = []
  for (const mod of moduleOrder) {
    const list = byModule.get(mod)
    if (!list || list.length === 0) continue
    lines.push(`### ${mod} (${list.length})`)
    lines.push('')
    lines.push('| Tool | Scope | Write | Description |')
    lines.push('|---|---|---|---|')
    for (const t of list) {
      const writeMark = t.isWrite ? 'yes' : 'no'
      lines.push(
        `| \`${t.name}\` | ${t.scope} | ${writeMark} | ${escapeCellPipes(squish(t.description))} |`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderResources(resources: ResourceEntry[]): string {
  if (resources.length === 0) return '_None._'
  const lines = ['| URI / template | Description |', '|---|---|']
  for (const r of resources) {
    lines.push(`| \`${r.uri}\` | ${escapeCellPipes(squish(r.description))} |`)
  }
  return lines.join('\n')
}

function renderPrompts(prompts: PromptEntry[]): string {
  if (prompts.length === 0) return '_None._'
  const lines = ['| Prompt | Description |', '|---|---|']
  for (const p of prompts) {
    lines.push(`| \`${p.name}\` | ${escapeCellPipes(squish(p.description))} |`)
  }
  return lines.join('\n')
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const toolFiles = fs
    .readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => path.join(TOOLS_DIR, f))

  const tools: ToolEntry[] = []
  for (const f of toolFiles) tools.push(...collectToolsFromFile(f))

  const resources = collectResources(RESOURCES_FILE)
  const prompts = collectPrompts(PROMPTS_FILE)

  const today = new Date().toISOString().slice(0, 10)
  const writeCount = tools.filter((t) => t.isWrite).length
  const readCount = tools.length - writeCount

  const md = `# SkillAi MCP — tool catalogue

> Generated by \`scripts/generate-mcp-tools-doc.ts\` on ${today}. Do not edit by hand — re-run the generator with \`npm run docs:mcp-tools\` after changing any \`src/lib/mcp/tools/*.ts\`.

This is the complete catalogue of the SkillAi MCP server: every tool, its required scope, and a one-line description. It mirrors what the server returns from a \`tools/list\` introspection call against \`/api/mcp\` (with a valid bearer token).

## Summary

- **${tools.length} tools** across ${new Set(tools.map((t) => t.module)).size} modules (${readCount} read · ${writeCount} write)
- **${resources.length} resources** (URI-addressable read views)
- **${prompts.length} prompts** (prebuilt multi-step workflows)

## Scopes

The required token scope is shown in the table below. The hierarchy is **admin ⊃ write ⊃ read** — an \`admin\` token can call any tool, a \`write\` token can call read + write tools but not admin ones, a \`read\` token can call read-only tools.

Every write tool also requires an explicit \`confirmed: true\` argument. The MCP client (claude-desktop, Claude Code) prompts you inline before sending; SkillAi rejects writes without confirmation.

## Tools

${renderToolsTable(tools)}

## Resources

${renderResources(resources)}

## Prompts

${renderPrompts(prompts)}

## Adding a new tool

1. Implement it in the right module under \`src/lib/mcp/tools/\` using \`server.registerTool(...)\` and wrap the handler with \`runTool(ctx, '<name>', '<scope>', <isWrite>, ...)\`.
2. If you added a new module, register it in \`src/lib/mcp/tools/index.ts\`.
3. Re-run \`npm run docs:mcp-tools\` to refresh this file.
`

  if (!fs.existsSync(path.dirname(OUTPUT))) {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  }
  fs.writeFileSync(OUTPUT, md, 'utf8')

  console.log(
    `Generated ${path.relative(process.cwd(), OUTPUT)} — ${tools.length} tools (${readCount} read, ${writeCount} write), ${resources.length} resources, ${prompts.length} prompts.`
  )
}

main()
