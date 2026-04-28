-- Migration: API token system (feat/mcp-foundation, issue #106)
-- Creates the api_tokens table for machine-to-machine authentication.
-- Tokens are stored as argon2 hashes; only the prefix is stored in plaintext
-- for efficient lookup. Raw tokens are returned to the caller exactly once.

CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"          varchar(100) NOT NULL,
  "prefix"        varchar(20) NOT NULL,
  "hash"          varchar(500) NOT NULL,
  "scopes"        text[] NOT NULL DEFAULT '{}',
  "expires_at"    timestamptz,
  "last_used_at"  timestamptz,
  "revoked_at"    timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

-- Prefix is the fast lookup key — must be globally unique across tenants so we
-- cannot accidentally verify a token against the wrong tenant's hash.
CREATE UNIQUE INDEX IF NOT EXISTS "api_tokens_prefix_unique" ON "api_tokens" ("prefix");

CREATE INDEX IF NOT EXISTS "idx_api_tokens_tenant" ON "api_tokens" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_api_tokens_user" ON "api_tokens" ("user_id");

-- RLS: tenant isolation
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_tokens_tenant_isolation"
  ON "api_tokens"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
