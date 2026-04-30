-- Migration: add share_token columns to role_submissions (feat/submissions-index-and-customer-feedback, issue #149)
-- Enables per-submission opaque share links for customer feedback ingestion.
-- Partial unique index ensures uniqueness only when share_token IS NOT NULL
-- (i.e. multiple NULL values are allowed — rows without a share link don't conflict).

ALTER TABLE "role_submissions" ADD COLUMN "share_token" varchar(64);
ALTER TABLE "role_submissions" ADD COLUMN "share_token_created_at" timestamp;
CREATE UNIQUE INDEX "uniq_role_submissions_share_token"
  ON "role_submissions" ("share_token")
  WHERE "share_token" IS NOT NULL;
