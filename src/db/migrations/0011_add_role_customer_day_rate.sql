ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "customer_day_rate" numeric(10,2);
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "rate_currency" varchar(3);
