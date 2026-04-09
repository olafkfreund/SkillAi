import { pgTable, pgPolicy, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { candidates } from './candidates'

/**
 * Stores web intelligence results for a candidate.
 * One row per candidate — upserted each time enrichment is re-run.
 *
 * webHits: array of { title, url, description, source } objects from Brave Search
 * githubProfile: { login, name, bio, publicRepos, followers, topRepos[] } from GitHub API
 */
export const candidateEnrichments = pgTable(
  'candidate_enrichments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    webHits: jsonb('web_hits').default([]),
    githubProfile: jsonb('github_profile'),
    searchedAt: timestamp('searched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('enrichments_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS()

export type CandidateEnrichment = typeof candidateEnrichments.$inferSelect
export type WebHit = {
  title: string
  url: string
  description: string
  source: string // 'linkedin' | 'github' | 'reddit' | 'twitter' | 'web'
}
export type GitHubProfile = {
  login: string
  name: string | null
  bio: string | null
  avatarUrl: string
  profileUrl: string
  publicRepos: number
  followers: number
  topRepos: Array<{ name: string; description: string | null; stars: number; language: string | null; url: string }>
}
