ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "target_fill_date" date;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "cutoff_date" date;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "customer_portal_path" varchar(500);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_base_url" varchar(500);
