-- Migration: Agency and customer branding logos (feat/branding-logos-and-checkbox-cleanup)
-- Adds a nullable logo_path column to both agencies and customers.
-- Files are stored at {UPLOAD_DIR}/{tenantId}/logos/{uuid}.{ext} on the host
-- and the DB stores the web-relative path (/uploads/{tenantId}/logos/{uuid}.ext).
-- Migration 0020 is reserved on a separate branch (PR #95) — we skip to 0021.

ALTER TABLE "agencies"
  ADD COLUMN IF NOT EXISTS "logo_path" varchar(500);

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "logo_path" varchar(500);
