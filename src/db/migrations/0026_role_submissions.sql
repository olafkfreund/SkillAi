-- Migration: role_submissions table (feat/role-submissions, issue #146)
-- Tracks candidates sent to a customer per role, with a 7-stage pipeline enum.
-- One row per (tenant, role, candidate) — unique constraint enforced.

CREATE TYPE "public"."submission_status" AS ENUM(
  'submitted',
  'interview_scheduled',
  'interview_done',
  'feedback_pending',
  'hired',
  'rejected',
  'withdrawn'
);

CREATE TABLE IF NOT EXISTS "role_submissions" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role_id"           uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "candidate_id"      uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "sent_at"           timestamp NOT NULL DEFAULT now(),
  "sent_by_user_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status"            submission_status NOT NULL DEFAULT 'submitted',
  "status_updated_at" timestamp NOT NULL DEFAULT now(),
  "notes"             text,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "updated_at"        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_role_submissions_tenant_role_candidate" UNIQUE ("tenant_id", "role_id", "candidate_id")
);

-- Supports bulk fetch of all submissions for a role (main panel query).
CREATE INDEX IF NOT EXISTS "idx_role_submissions_role"
  ON "role_submissions" ("role_id");

-- Supports stale-submission stream: WHERE status NOT IN (...) AND status_updated_at < cutoff.
CREATE INDEX IF NOT EXISTS "idx_role_submissions_status"
  ON "role_submissions" ("status", "status_updated_at");

ALTER TABLE "role_submissions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_submissions_tenant_isolation"
  ON "role_submissions"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
