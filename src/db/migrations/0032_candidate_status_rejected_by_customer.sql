-- Migration: 0032_candidate_status_rejected_by_customer
-- Adds 'rejected_by_customer' to the candidate_status enum.
-- Additive-only: ALTER TYPE ... ADD VALUE is safe on live data.
-- Operator apply command (post-merge):
--   docker exec -i skillai-db-1 psql -U skillai -d skillai \
--     < src/db/migrations/0032_candidate_status_rejected_by_customer.sql

ALTER TYPE candidate_status ADD VALUE IF NOT EXISTS 'rejected_by_customer';
