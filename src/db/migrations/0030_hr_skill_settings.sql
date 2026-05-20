-- Migration: hr_skill_enabled toggle + hr_skill_profile enum for tenant settings (issue #198)
-- Part of Epic #190, Stream B (HR Skill Integration).
--
-- Purely additive: creates one new pg-enum type used by the AI Behaviour
-- settings card. The toggle and profile values are stored as plain-text rows
-- in tenant_settings (key-value store) — no column additions are needed.
--
-- Uses DO $$ ... $$ guard so re-running is idempotent.

DO $$ BEGIN
  CREATE TYPE "public"."hr_skill_profile"
    AS ENUM ('recruiter-eu-uk', 'talent-acquisition', 'people-analytics');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
