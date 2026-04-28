-- Migration: Multi-language transcript analysis (Epic #85 / #90)
-- Adds a detected_language column to transcript_analyses storing the BCP 47
-- short code of the language detected for the source transcript. The AI
-- analysis (summary + dimension reasoning) is generated in the same language
-- so the recruiter can read the assessment without translating. Defaults to
-- 'en' for backward compatibility — all existing analyses are English.

ALTER TABLE "transcript_analyses"
  ADD COLUMN IF NOT EXISTS "detected_language" varchar(10) NOT NULL DEFAULT 'en';
