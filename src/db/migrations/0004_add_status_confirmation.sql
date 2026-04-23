ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "status_confirmed_by" uuid REFERENCES "users"("id");
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "status_confirmed_at" timestamp with time zone;
