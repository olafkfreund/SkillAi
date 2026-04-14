CREATE TABLE IF NOT EXISTS "cv_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL UNIQUE REFERENCES "candidates"("id") ON DELETE CASCADE,
  "experience_level" text,
  "summary" text,
  "technical_skills" jsonb DEFAULT '[]'::jsonb,
  "companies" jsonb DEFAULT '[]'::jsonb,
  "personalizable_moments" jsonb DEFAULT '[]'::jsonb,
  "extraction_status" text NOT NULL DEFAULT 'pending',
  "error_message" text,
  "ai_model" text,
  "extracted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "cv_profiles" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cv_profiles_tenant_isolation" ON "cv_profiles"
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cv_profiles_tenant" ON "cv_profiles"("tenant_id");
