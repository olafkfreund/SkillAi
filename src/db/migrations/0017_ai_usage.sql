-- Migration: AI usage tracking table (Epic #59 / #63)
-- Persists every AI call's token usage + cost for per-tenant analytics.
-- userId nullable so background after() jobs can log without session context.

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid,
  "operation" varchar(64) NOT NULL,
  "model" varchar(100) NOT NULL,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "cache_creation_tokens" integer,
  "cache_read_tokens" integer,
  "cost_usd" numeric(10, 6) NOT NULL,
  "duration_ms" integer,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ai_usage_tenant_created" ON "ai_usage" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_ai_usage_operation" ON "ai_usage" ("operation");

ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_tenant_isolation" ON "ai_usage" FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
