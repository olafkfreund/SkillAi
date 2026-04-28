/**
 * MCP resources — URI-templated handles for the most-frequently-referenced
 * SkillAi entities. Resources let an LLM client say "open
 * skillai://candidates/<id>" and get back a JSON snapshot, without first
 * having to call a tool.
 *
 * Templates exposed:
 *   - skillai://candidates/{id}        — candidate record + agency name
 *   - skillai://roles/{id}             — role record + ranked candidates
 *   - skillai://interview-packs/{id}   — pack header + questions
 *   - skillai://my-shortlists          — manager flow: roles awaiting my decision
 */

import { eq, desc } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  candidates,
  agencies,
  roles,
  scores,
  interviewPacks,
  interviewQuestions,
} from '@/db/schema'
import { runWithActionContext } from '@/lib/auth/action-context'
import { getMyAssignedRoles } from '@/actions/role-managers'
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpContext } from '../context'

function jsonContents(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}

export function registerAllResources(server: McpServer, ctx: McpContext): void {
  // -- candidates/{id} --------------------------------------------------------
  server.registerResource(
    'candidate',
    new ResourceTemplate('skillai://candidates/{id}', { list: undefined }),
    {
      title: 'SkillAi candidate',
      description: 'A single candidate record with their agency name and contact details.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const result = await withTenant(ctx.tenantId, async (tx) => {
        const [row] = await tx
          .select({
            candidate: candidates,
            agencyName: agencies.name,
          })
          .from(candidates)
          .leftJoin(agencies, eq(candidates.agencyId, agencies.id))
          .where(eq(candidates.id, id))
          .limit(1)
        return row ?? null
      })
      return jsonContents(uri, result)
    }
  )

  // -- roles/{id} -------------------------------------------------------------
  server.registerResource(
    'role',
    new ResourceTemplate('skillai://roles/{id}', { list: undefined }),
    {
      title: 'SkillAi role with ranked candidates',
      description:
        'A role record together with all candidates scored against it, sorted by overallScore.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const result = await withTenant(ctx.tenantId, async (tx) => {
        const [role] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1)
        if (!role) return { role: null, candidates: [] }
        const ranked = await tx
          .select({
            candidateId: candidates.id,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            overallScore: scores.overallScore,
            scoreStatus: scores.scoreStatus,
          })
          .from(scores)
          .innerJoin(candidates, eq(scores.candidateId, candidates.id))
          .where(eq(scores.roleId, id))
          .orderBy(desc(scores.overallScore))
        return { role, candidates: ranked }
      })
      return jsonContents(uri, result)
    }
  )

  // -- interview-packs/{id} ---------------------------------------------------
  server.registerResource(
    'interview-pack',
    new ResourceTemplate('skillai://interview-packs/{id}', { list: undefined }),
    {
      title: 'SkillAi interview pack',
      description: 'An interview pack with all generated questions.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const result = await withTenant(ctx.tenantId, async (tx) => {
        const [pack] = await tx
          .select()
          .from(interviewPacks)
          .where(eq(interviewPacks.id, id))
          .limit(1)
        if (!pack) return { pack: null, questions: [] }
        const questions = await tx
          .select()
          .from(interviewQuestions)
          .where(eq(interviewQuestions.packId, id))
        return { pack, questions }
      })
      return jsonContents(uri, result)
    }
  )

  // -- my-shortlists (static URI) --------------------------------------------
  server.registerResource(
    'my-shortlists',
    'skillai://my-shortlists',
    {
      title: 'My shortlists (hiring manager)',
      description: 'For the calling user, the roles where you have approvals to make.',
      mimeType: 'application/json',
    },
    async (uri) => {
      // getMyAssignedRoles uses getActionContext internally — establish the
      // context for the duration of the read.
      const result = await runWithActionContext(
        { tenantId: ctx.tenantId, userId: ctx.userId, userRole: ctx.userRole },
        () => getMyAssignedRoles()
      )
      return jsonContents(uri, { assignedRoles: result })
    }
  )
}
