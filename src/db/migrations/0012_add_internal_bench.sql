-- agencies: system flags
ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "is_internal" boolean NOT NULL DEFAULT false;
ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agencies_tenant_internal"
  ON "agencies" ("tenant_id") WHERE "is_internal";

-- candidates: availability enum + columns
DO $$ BEGIN
  CREATE TYPE "availability_status" AS ENUM ('available', 'on_project', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "availability_status" availability_status NOT NULL DEFAULT 'available';
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "available_from" date;
CREATE INDEX IF NOT EXISTS "idx_candidates_agency_availability"
  ON "candidates" ("agency_id", "availability_status");

-- Backfill: one Internal agency per existing tenant
INSERT INTO "agencies" ("tenant_id", "name", "is_internal", "is_system", "is_active")
SELECT t.id, 'Internal', true, true, true
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "agencies" a WHERE a.tenant_id = t.id AND a.is_internal = true
);
