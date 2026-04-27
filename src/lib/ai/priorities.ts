/**
 * Manager priority keywords — soft-signal prompt block builder.
 *
 * Used by every role-aware AI helper (CV scoring, interview transcript analysis,
 * interview pack generation, role-fit batch, shortlist summary) to insert the
 * recruiter/manager-supplied priorities into the cached role-context block.
 *
 * Pattern mirrors DEC-009: priorities are SOFT SIGNALS that influence the AI's
 * reasoning text and summary, but never directly drag the four scored dimensions
 * (technical_skills, experience_level, cultural_fit, communication). The prompt
 * explicitly tells the model not to penalise/boost overall_score for priorities
 * alone.
 *
 * Empty array returns an empty string so prompts on roles WITHOUT priorities are
 * byte-identical to the pre-feature baseline (regression-safe).
 */

/**
 * Build the manager priorities block for a role's cached prompt context.
 *
 * @param keywords  The role.priorityKeywords array (may be empty)
 * @returns         Empty string if no keywords; otherwise a prefixed bulleted
 *                  block with a soft-signal instruction.
 */
export function formatManagerPriorities(keywords: readonly string[] | null | undefined): string {
  if (!keywords || keywords.length === 0) return ''
  const cleaned = keywords.map((k) => k.trim()).filter((k) => k.length > 0)
  if (cleaned.length === 0) return ''
  const bullets = cleaned.map((k) => `- ${k}`).join('\n')
  return `

MANAGER PRIORITIES (soft signals — not scored dimensions):
${bullets}

When evaluating this candidate, treat the priorities above as soft signals: mention in your summary how the candidate aligns or doesn't align with each, but do NOT directly penalize or boost overall_score on the basis of priorities alone — the four scored dimensions remain the source of the numeric score.`
}
