-- Migration: Admin-triggered force password reset (issue #220, part of Epic #37)
--
-- Adds two columns to users to support the admin "Force password reset" flow:
--   password_reset_token_hash:       sha256 hex digest of the plaintext token;
--                                    the plaintext is never stored.
--   password_reset_token_expires_at: 1 hour from generation; the reset endpoint
--                                    must reject expired tokens.
--
-- Both nullable: only populated while a reset is in flight; cleared once the
-- user completes the reset (or the row is regenerated).
--
-- Purely additive — no existing data touched.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_reset_token_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" timestamp with time zone;
