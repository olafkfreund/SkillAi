-- Migration: EU/UK right-to-work + compliance fields on candidates (issue #191)
-- Part of Epic #190.
--
-- Purely additive: 3 new pg-enums + 11 new nullable columns (except
-- sponsorship_required which is NOT NULL DEFAULT false — safe because
-- existing rows get the false default immediately on ALTER TABLE).
--
-- Uses IF NOT EXISTS / DO $$ ... $$ guards so re-running the migration
-- is idempotent.

-- 1. New enums
DO $$ BEGIN
  CREATE TYPE "public"."right_to_work_status"
    AS ENUM ('checked', 'pending', 'fail', 'exempted', 'not_required');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."right_to_work_document_type"
    AS ENUM (
      'passport_uk', 'passport_eu', 'passport_other',
      'brp', 'share_code', 'visa',
      'settled_status', 'presettled_status', 'other'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."gdpr_processing_consent_by"
    AS ENUM ('candidate', 'recruiter', 'agency');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. New columns on candidates
ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "right_to_work_status"       "right_to_work_status",
  ADD COLUMN IF NOT EXISTS "right_to_work_document_type" "right_to_work_document_type",
  ADD COLUMN IF NOT EXISTS "right_to_work_expiry"        date,
  ADD COLUMN IF NOT EXISTS "right_to_work_checked_at"    timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "right_to_work_checked_by"    uuid
    REFERENCES "users"("id") ON DELETE NO ACTION,
  ADD COLUMN IF NOT EXISTS "share_code"                  varchar(20),
  ADD COLUMN IF NOT EXISTS "sponsorship_required"        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nationality"                 varchar(100),
  ADD COLUMN IF NOT EXISTS "notice_period_days"          integer,
  ADD COLUMN IF NOT EXISTS "gdpr_processing_consent_at"  timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "gdpr_processing_consent_by"  "gdpr_processing_consent_by";
