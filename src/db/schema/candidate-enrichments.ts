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
    verifiedProfiles: jsonb('verified_profiles').notNull().default(sql`'[]'::jsonb`),
    rejectedUrls: jsonb('rejected_urls').notNull().default(sql`'[]'::jsonb`),
    stackOverflowProfile: jsonb('stack_overflow_profile'),
    devtoProfile: jsonb('devto_profile'),
    personalSiteSummary: jsonb('personal_site_summary'),
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
export type VerifiedProfile = {
  source: 'linkedin' | 'github' | 'stack_overflow' | 'devto' | 'medium' | 'personal' | 'web'
  url: string
  confidence: number // 0-100
  category: 'high' | 'medium' | 'low' | 'not_match'
  reason: string
  verifiedBy: 'auto' | 'recruiter'
  verifiedAt: string // ISO
}
export type RejectedUrl = {
  source: string
  url: string
  reason: string
  rejectedAt: string // ISO
}
export type StackOverflowProfile = {
  username: string
  reputation: number
  topTags: string[]
  profileUrl: string
}
export type DevtoProfile = {
  username: string
  joinedAt: string
  postsCount: number
  topPosts: { title: string; url: string }[]
}
export type PersonalSiteSummary = {
  url: string
  title: string
  aiSummary: string
}
