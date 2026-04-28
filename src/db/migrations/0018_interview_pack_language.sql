-- Migration: Multi-language interview + screening packs (Epic #85 / #86)
-- Adds a language column to interview_packs storing the BCP 47 short code
-- of the language the pack was generated in. Defaults to 'en' for backward
-- compatibility — all existing packs are English.

ALTER TABLE "interview_packs"
  ADD COLUMN IF NOT EXISTS "language" varchar(10) NOT NULL DEFAULT 'en';
