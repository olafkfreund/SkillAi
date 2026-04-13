-- Role location fields
DO $$ BEGIN
  CREATE TYPE "public"."work_mode" AS ENUM('remote', 'hybrid', 'onsite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "country" varchar(100);
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "city" varchar(100);
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "work_mode" "work_mode";
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "language_requirements" text[] NOT NULL DEFAULT '{}';

-- Candidate location fields
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "country" varchar(100);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "city" varchar(100);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "languages_spoken" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "willing_to_relocate" boolean;
