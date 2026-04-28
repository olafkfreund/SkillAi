/**
 * MCP prompts — opinionated prompt templates that orchestrate multi-step
 * SkillAi workflows for the LLM client.
 *
 * Prompts return a list of messages the client renders into the user's
 * conversation. They do NOT execute the workflow — they suggest the
 * sequence of tools/resources for the LLM to call. The LLM still drives
 * the actual work.
 *
 * Templates:
 *   - prepare-interview-brief         — pull CV, score, pack, notes for an interviewer
 *   - weekly-shortlist-review         — manager-flow weekly digest of pending decisions
 *   - email-candidate-introduction    — orchestrate compose-email + score-summary
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpContext } from '../context'

const PrepareBriefArgs = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
}

const ShortlistReviewArgs = {
  roleId: z.string().uuid(),
}

const EmailIntroArgs = {
  candidateId: z.string().uuid(),
  roleId: z.string().uuid(),
  recipientEmail: z.string().email(),
}

function userMessage(text: string) {
  return {
    role: 'user' as const,
    content: { type: 'text' as const, text },
  }
}

export function registerAllPrompts(server: McpServer, _ctx: McpContext): void {
  // -- prepare-interview-brief ------------------------------------------------
  server.registerPrompt(
    'prepare-interview-brief',
    {
      title: 'Prepare interview brief for a candidate',
      description:
        'Assemble everything an interviewer needs to walk into a conversation with a specific ' +
        'candidate against a specific role: CV summary, dimension scores with reasoning, the ' +
        'generated interview pack, and any prior notes or transcript analyses.',
      argsSchema: PrepareBriefArgs,
    },
    (args) => ({
      messages: [
        userMessage(
          `I'm preparing to interview a candidate. Please assemble a brief for me using these steps:

1. Read the candidate record: call \`get_candidate\` with candidateId="${args.candidateId}".
2. Read the role: call \`get_role\` with roleId="${args.roleId}".
3. Read the score: call \`get_candidate_score\` with candidateId="${args.candidateId}" and roleId="${args.roleId}". Pay particular attention to per-dimension reasoning.
4. List interview packs for this candidate+role: call \`list_interview_packs\` with both ids set, then \`get_interview_pack\` for the most recent complete one.
5. Optionally also call resource skillai://candidates/${args.candidateId} for a richer candidate snapshot.

Then produce a one-page interviewer brief in en-GB English with these sections:
- "At a glance" (overall score, location, availability, agency)
- "Strengths" (drawn from per-dimension reasoning above ~75)
- "Risks / things to probe" (drawn from per-dimension reasoning below ~65)
- "Recommended questions" (the top 5–7 from the interview pack)
- "Open questions for the candidate"`
        ),
      ],
    })
  )

  // -- weekly-shortlist-review ------------------------------------------------
  server.registerPrompt(
    'weekly-shortlist-review',
    {
      title: 'Weekly shortlist review (hiring manager)',
      description:
        'For a hiring manager, summarise the current state of approvals on a role and surface ' +
        'the top candidates still awaiting a decision.',
      argsSchema: ShortlistReviewArgs,
    },
    (args) => ({
      messages: [
        userMessage(
          `I'd like a weekly review of role ${args.roleId}. Please:

1. Call \`get_role\` to summarise the role title, customer, deadlines, and budget.
2. Call \`get_role_with_candidates\` to see the ranked candidates.
3. Call \`get_approvals_for_role\` to see which approvals are still pending.

Then in en-GB English produce:
- A 2–3 sentence headline (role title, days until cutoffDate, count pending, count decided).
- A "still to decide" table with overallScore, status, and a one-sentence rationale per candidate.
- An "already decided" appendix with name + decision + comment.

Use markdown.`
        ),
      ],
    })
  )

  // -- email-candidate-introduction ------------------------------------------
  server.registerPrompt(
    'email-candidate-introduction',
    {
      title: 'Compose candidate introduction email',
      description:
        'Draft an introduction email to a third party (typically a hiring manager) about a ' +
        'specific candidate against a specific role. Pulls the CV summary and score so the ' +
        'narrative is grounded in actual SkillAi data.',
      argsSchema: EmailIntroArgs,
    },
    (args) => ({
      messages: [
        userMessage(
          `Please draft a candidate introduction email to ${args.recipientEmail}.

Steps:
1. \`get_candidate\` with candidateId="${args.candidateId}" — note name, location, availability.
2. \`get_role\` with roleId="${args.roleId}" — note title, customer, location.
3. \`get_candidate_score\` with both ids — read the AI summary and any per-dimension reasoning above 75.

Then produce a single-paragraph subject line + 4–6 short paragraphs of body in en-GB English:
- Why this candidate, in one sentence (drawn from the AI summary).
- Their relevant strengths (max 3 bullets, grounded in the dimension reasoning).
- Their availability and location (from the candidate record).
- A clear next-step ask (a 30-minute call, a CV download from the dashboard, etc.)
- Sign-off referencing SkillAi and the calling user.

Do not invent skills or experience the data does not support. If a dimension is below 60, do not mention it in the email — flag it back to me separately.`
        ),
      ],
    })
  )
}
