-- Migration: HR skill toggle settings (issue #198, part of Epic #190)
--
-- The HR skill toggle re-uses the existing `tenant_settings` K/V table
-- (no schema change required) with two new keys:
--
--   key = 'hr_skill_enabled'  value = 'true' | 'false'   default 'false'
--   key = 'hr_skill_profile'  value = 'recruiter-eu-uk'  default 'recruiter-eu-uk'
--
-- This file is intentionally a NO-OP at SQL level — it exists only to
-- reserve the migration sequence number and document the new keys for
-- reviewers. The data rows are created on-demand by the #198 server
-- action when a tenant admin first enables the toggle on /settings.
--
-- DO NOT remove this file even though it is empty: drizzle-kit tracks
-- the migration journal and renumbering migrations after they have
-- shipped causes drift on production tenant DBs.
--
-- The real #198 PR will replace this comment-only file with either:
--   (a) a backfill INSERT for the default values, OR
--   (b) a more substantive guard (e.g. a CHECK constraint on the
--       allowed `hr_skill_profile` values).
--
-- This stub is committed via #197 because the per-tenant toggle
-- reader (`src/lib/skills/tenant-toggle.ts`) is part of the gating
-- contract that the three AI call-site edits in #197 depend on.

-- No-op marker statement (some migration runners reject empty files).
DO $$ BEGIN
  -- Reserved for #198: default-value backfill / CHECK constraint goes here.
  PERFORM 1;
END $$;
