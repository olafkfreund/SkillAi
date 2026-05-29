/**
 * Build-time shim that imports every route file currently registered in the
 * canonical OpenAPI endpoint (src/app/api/openapi.json/route.ts), then dumps
 * the resulting spec to argv[2].
 *
 * Runs inside the parent repo via tsx so that the @/ path alias resolves.
 * Pure side-effect imports — no HTTP server, no DB queries.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const outPath = path.resolve(process.cwd(), process.argv[2])
  if (!outPath) {
    console.error('usage: tsx shim-openapi-dump.ts <output-path>')
    process.exit(1)
  }

  // Mirror the imports from src/app/api/openapi.json/route.ts.
  // Keep this list in sync if the canonical route adds/removes registrations.
  await import('@/app/api/approvals/[roleId]/route')
  await import('@/app/api/approvals/[roleId]/send/route')
  await import('@/app/api/approvals/[roleId]/[candidateId]/approve/route')
  await import('@/app/api/approvals/[roleId]/[candidateId]/reject/route')
  await import('@/app/api/approvals/[roleId]/approve-all/route')
  await import('@/app/api/roles/[roleId]/managers/route')
  await import('@/app/api/roles/[roleId]/managers/[userId]/route')
  await import('@/app/api/candidates/[candidateId]/notes/route')
  await import('@/app/api/notes/route')
  await import('@/app/api/notes/[noteId]/route')
  await import('@/app/api/users/route')
  await import('@/app/api/users/invite/route')
  await import('@/app/api/users/[userId]/role/route')
  await import('@/app/api/users/[userId]/deactivate/route')
  await import('@/app/api/settings/api-keys/route')
  await import('@/app/api/settings/api-keys/[provider]/route')
  await import('@/app/api/settings/general/route')
  await import('@/app/api/settings/trusted-hosts/route')
  await import('@/app/api/settings/default-pack-language/route')
  await import('@/app/api/candidates/[candidateId]/enrichment/trigger/route')
  await import('@/app/api/candidates/[candidateId]/enrichment/confirm/route')
  await import('@/app/api/candidates/[candidateId]/enrichment/dismiss/route')
  await import('@/app/api/candidates/[candidateId]/cv/reformat/route')
  await import('@/app/api/customers/[customerId]/framework/route')
  await import('@/app/api/scores/rescore/route')
  await import('@/app/api/scores/route')
  await import('@/app/api/candidates/[candidateId]/route')
  await import('@/app/api/candidates/[candidateId]/availability/route')
  await import('@/app/api/candidates/[candidateId]/agency/route')
  await import('@/app/api/candidates/[candidateId]/status/route')
  await import('@/app/api/candidates/[candidateId]/archive/route')
  await import('@/app/api/roles/route')
  await import('@/app/api/roles/[roleId]/route')
  await import('@/app/api/roles/[roleId]/regenerate-tags/route')
  await import('@/app/api/roles/[roleId]/archive/route')

  const { getOpenApiDocument } = await import('@/lib/api/openapi')
  const doc = getOpenApiDocument() as Record<string, unknown>

  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
  }
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8')

  const pathCount = Object.keys((doc.paths as object) ?? {}).length
  console.log(
    `Wrote OpenAPI snapshot → ${path.relative(process.cwd(), outPath)} (${pathCount} paths)`
  )
}

main().catch((err) => {
  console.error('shim failure:', err)
  process.exit(1)
})
