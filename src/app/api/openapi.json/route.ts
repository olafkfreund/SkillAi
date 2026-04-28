import { withApiAuth } from '@/lib/api/auth-middleware'
import { getOpenApiDocument } from '@/lib/api/openapi'

// Import all route files so their registerRoute() calls execute at module scope.
// Each import is a side effect that populates the registry.
import '@/app/api/approvals/[roleId]/route'
import '@/app/api/approvals/[roleId]/send/route'
import '@/app/api/approvals/[roleId]/[candidateId]/approve/route'
import '@/app/api/approvals/[roleId]/[candidateId]/reject/route'
import '@/app/api/approvals/[roleId]/approve-all/route'
import '@/app/api/roles/[roleId]/managers/route'
import '@/app/api/roles/[roleId]/managers/[userId]/route'
import '@/app/api/candidates/[candidateId]/notes/route'
import '@/app/api/notes/route'
import '@/app/api/notes/[noteId]/route'
import '@/app/api/users/route'
import '@/app/api/users/invite/route'
import '@/app/api/users/[userId]/role/route'
import '@/app/api/users/[userId]/deactivate/route'
import '@/app/api/settings/api-keys/route'
import '@/app/api/settings/api-keys/[provider]/route'
import '@/app/api/settings/general/route'
import '@/app/api/settings/trusted-hosts/route'
import '@/app/api/settings/default-pack-language/route'
import '@/app/api/candidates/[candidateId]/enrichment/trigger/route'
import '@/app/api/candidates/[candidateId]/enrichment/confirm/route'
import '@/app/api/candidates/[candidateId]/enrichment/dismiss/route'
import '@/app/api/candidates/[candidateId]/cv/reformat/route'
import '@/app/api/customers/[customerId]/framework/route'
import '@/app/api/scores/rescore/route'
import '@/app/api/scores/route'
import '@/app/api/candidates/[candidateId]/route'
import '@/app/api/candidates/[candidateId]/availability/route'
import '@/app/api/candidates/[candidateId]/agency/route'
import '@/app/api/candidates/[candidateId]/status/route'
import '@/app/api/candidates/[candidateId]/archive/route'
import '@/app/api/roles/route'
import '@/app/api/roles/[roleId]/route'
import '@/app/api/roles/[roleId]/regenerate-tags/route'
import '@/app/api/roles/[roleId]/archive/route'

export const GET = withApiAuth(
  'read',
  async (_req, _ctx) => {
    const doc = getOpenApiDocument()
    return Response.json(doc)
  }
)
