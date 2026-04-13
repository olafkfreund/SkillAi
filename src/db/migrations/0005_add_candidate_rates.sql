ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "candidate_rate" numeric(10,2);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "customer_rate" numeric(10,2);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rate_currency" varchar(3);
