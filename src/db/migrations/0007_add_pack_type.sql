DO $$ BEGIN
  CREATE TYPE "public"."pack_type" AS ENUM('full', 'pre_screening');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "interview_packs" ADD COLUMN IF NOT EXISTS "pack_type" "pack_type" NOT NULL DEFAULT 'full';
