-- Migration: User password-reset-required flag (Epic #59 / #61)
-- Adds two columns to users for the manual user creation flow:
--   password_reset_required: when admin creates a user with a temp password,
--                            this is set true; middleware redirects the user
--                            to change-password on first login.
--   last_password_change_at: tracks when password was most recently changed.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_reset_required" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_password_change_at" timestamp with time zone;
