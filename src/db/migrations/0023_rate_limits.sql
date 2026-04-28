-- Migration: API rate limit sliding-window table (feat/mcp-foundation, issue #109)
-- Tracks per-token, per-tenant, and per-write request counts in 1-minute windows.
-- No RLS — this is internal infrastructure, not tenant user data.

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bucket_key      varchar(120) NOT NULL,
  window_start    timestamp NOT NULL,
  request_count   integer NOT NULL DEFAULT 0,
  UNIQUE (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON api_rate_limits (window_start);
