-- Migration: Hiring manager view + approval flow (Epic #73)
-- 1. Adds 'hiring_manager' to user_role enum
-- 2. Adds shortlist_sent_at to roles (handoff timestamp)
-- 3. Adds is_shareable flag to notes
-- 4. Creates role_managers junction table (which managers are assigned to which roles)
-- 5. Creates candidate_role_approvals table (per-candidate approval decisions)

-- 1. Extend role enum
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'hiring_manager';

-- 2. Roles handoff timestamp
ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "shortlist_sent_at" timestamp;

-- 3. Notes shareability flag
ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "is_shareable" boolean NOT NULL DEFAULT false;

-- 4. role_managers junction table
CREATE TABLE IF NOT EXISTS "role_managers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_primary" boolean NOT NULL DEFAULT false,
  "added_by" uuid REFERENCES "users"("id"),
  "added_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "role_managers_role_user_unique" UNIQUE ("role_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_role_managers_user" ON "role_managers" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_role_managers_role" ON "role_managers" ("role_id");

ALTER TABLE "role_managers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_managers_tenant_isolation" ON "role_managers" FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- 5. candidate_role_approvals
CREATE TABLE IF NOT EXISTS "candidate_role_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "manager_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "decision" varchar(20) NOT NULL DEFAULT 'pending',
  "comment" text,
  "decided_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "approvals_role_candidate_manager_unique" UNIQUE ("role_id", "candidate_id", "manager_id"),
  CONSTRAINT "approvals_decision_check" CHECK ("decision" IN ('pending','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS "idx_approvals_role_manager" ON "candidate_role_approvals" ("role_id", "manager_id");

ALTER TABLE "candidate_role_approvals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals_tenant_isolation" ON "candidate_role_approvals" FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
