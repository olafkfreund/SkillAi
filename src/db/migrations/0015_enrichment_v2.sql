-- Migration: Candidate enrichment v2 columns
-- Part of Epic #52. Adds curated profile-verification fields to candidate_enrichments:
--   verified_profiles: AI/recruiter-confirmed profiles (the curated layer above raw web_hits)
--   rejected_urls: URLs explicitly rejected, suppressed on next enrichment run
--   stack_overflow_profile / devto_profile / personal_site_summary: structured per-platform data

ALTER TABLE "candidate_enrichments"
  ADD COLUMN IF NOT EXISTS "verified_profiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rejected_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "stack_overflow_profile" jsonb,
  ADD COLUMN IF NOT EXISTS "devto_profile" jsonb,
  ADD COLUMN IF NOT EXISTS "personal_site_summary" jsonb;
