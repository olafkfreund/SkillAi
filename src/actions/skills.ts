'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db'
import { getActionContext } from '@/lib/auth/action-context'
import { hasRole } from '@/lib/auth/require-role'

export type SkillAggregate = {
  /** Lowercased + trimmed grouping key (e.g. "react") */
  skillKey: string
  /** Most-frequent original casing in the data (e.g. "React") */
  displayName: string
  /** Distinct candidates with this skill in their cv_profile */
  candidateCount: number
}

type AggregateRow = {
  skill_key: string
  display_name: string
  candidate_count: string | number
}

/**
 * Aggregates skills across all candidates in the current tenant. Skills are
 * grouped case-insensitively (`lower(trim(skill))`) so "React", "react" and
 * " REACT " collapse into one entry; the display_name is the casing variant
 * that appears most often in the data.
 *
 * Only complete cv_profile rows count — a candidate whose extraction is still
 * pending or has failed contributes no skills (would otherwise undercount and
 * surface stale partials).
 *
 * Recruiter+ only — skills are not customer / manager / viewer scope.
 */
export async function getUniqueSkillsWithCandidateCounts(): Promise<SkillAggregate[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userRole } = ctx

  if (!hasRole(userRole, 'recruiter')) return []

  const rows = await withTenant(tenantId, async (tx) =>
    tx.execute(sql`
      WITH unnested AS (
        SELECT
          candidate_id,
          jsonb_array_elements_text(technical_skills) AS skill_raw
        FROM cv_profiles
        WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
          AND extraction_status = 'complete'
      ),
      keyed AS (
        SELECT
          lower(trim(skill_raw)) AS skill_key,
          trim(skill_raw)        AS skill_original,
          candidate_id
        FROM unnested
        WHERE length(trim(skill_raw)) > 0
      ),
      original_counts AS (
        SELECT
          skill_key,
          skill_original,
          COUNT(*)                       AS occurrences,
          ROW_NUMBER() OVER (
            PARTITION BY skill_key
            ORDER BY COUNT(*) DESC, skill_original ASC
          )                              AS rn
        FROM keyed
        GROUP BY skill_key, skill_original
      ),
      candidate_counts AS (
        SELECT
          skill_key,
          COUNT(DISTINCT candidate_id) AS candidate_count
        FROM keyed
        GROUP BY skill_key
      )
      SELECT
        cc.skill_key,
        oc.skill_original AS display_name,
        cc.candidate_count
      FROM candidate_counts cc
      INNER JOIN original_counts oc
        ON oc.skill_key = cc.skill_key AND oc.rn = 1
      ORDER BY cc.candidate_count DESC, cc.skill_key ASC
    `),
  )

  return (Array.from(rows) as AggregateRow[]).map((r) => ({
    skillKey: r.skill_key,
    displayName: r.display_name,
    candidateCount: Number(r.candidate_count),
  }))
}
