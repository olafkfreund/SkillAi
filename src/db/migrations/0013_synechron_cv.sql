-- Migration: Synechron CV data + candidate ID columns
-- Adds two columns to candidates for Epic #28 (one-click Synechron CV export):
--   synechron_cv_data: cached AI-extracted Synechron-template-shaped JSON
--   synechron_candidate_id: optional SYNE-#### tag (text, nullable)

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "synechron_cv_data" jsonb;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "synechron_candidate_id" varchar(64);
