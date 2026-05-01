-- Migration: performance indexes for dashboard + candidates list queries (issue #83)
--
-- Each index is `IF NOT EXISTS` so re-running the migration is idempotent.
-- Plain (non-CONCURRENT) CREATE because Drizzle migrate runs each file in an
-- implicit transaction and CONCURRENTLY can't run inside one.
--
-- For production application against a busy table, run manually with
-- `CREATE INDEX CONCURRENTLY ...` outside this migration to avoid a brief
-- write lock. Index definitions are otherwise identical.

-- candidates: covers the main candidates list query (tenant + active + recent)
CREATE INDEX IF NOT EXISTS "idx_candidates_tenant_active_created"
  ON "candidates" ("tenant_id", "is_active", "created_at" DESC);

-- candidates: covers status-filtered candidate views
CREATE INDEX IF NOT EXISTS "idx_candidates_tenant_status_active"
  ON "candidates" ("tenant_id", "status", "is_active");

-- scores: covers "Top candidates this week" + "Scored this week" stat
CREATE INDEX IF NOT EXISTS "idx_scores_status_updated"
  ON "scores" ("score_status", "updated_at" DESC);

-- roles: covers "Recent roles" widget on the dashboard
CREATE INDEX IF NOT EXISTS "idx_roles_tenant_active_created"
  ON "roles" ("tenant_id", "is_active", "created_at" DESC);

-- interview_slots: covers "Upcoming interviews" widget
-- Existing single-column indexes on tenant_id + candidate_id are kept; this
-- compound index serves the (scheduled_at >= now AND status != 'cancelled') filter.
CREATE INDEX IF NOT EXISTS "idx_interview_slots_scheduled_status"
  ON "interview_slots" ("scheduled_at", "status");

-- interview_packs: covers "Packs ready" stat (count by generation_status)
CREATE INDEX IF NOT EXISTS "idx_interview_packs_status"
  ON "interview_packs" ("generation_status");
