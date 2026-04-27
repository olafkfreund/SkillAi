-- Migration: Manager priority keywords on roles
-- Part of Epic #42. Adds two columns to the roles table:
--   priority_keywords: manager-supplied soft-signal phrases (e.g. "Self-starting",
--                      "Engineer who codes, not a developer who knows infra"). Used
--                      as a soft signal in the cached AI role-context block per
--                      DEC-009 pattern. NOT a fifth scored dimension.
--   priority_keywords_updated_at: timestamp of the last edit; used by the stale-score
--                                 pill to detect outdated scores after priorities change.

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "priority_keywords" text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "priority_keywords_updated_at" timestamp;
