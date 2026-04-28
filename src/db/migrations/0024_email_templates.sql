-- Migration: In-app candidate emailing (issue #74)
-- 1. Creates email_templates table (per-tenant reusable templates)
-- 2. Creates sent_emails table (audit log of every email dispatched)

-- 1. email_templates
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"       varchar(80) NOT NULL,
  "category"   varchar(40) NOT NULL,
  "subject"    varchar(200) NOT NULL,
  "body"       text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "email_templates_tenant_name_unique" UNIQUE ("tenant_id", "name"),
  CONSTRAINT "email_templates_category_check" CHECK (
    "category" IN ('screening_invite','scoring_decline','post_interview','rejection','offer_pending','custom')
  )
);

CREATE INDEX IF NOT EXISTS "idx_email_templates_tenant" ON "email_templates" ("tenant_id", "category");

ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_tenant_isolation" ON "email_templates" FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- 2. sent_emails
CREATE TABLE IF NOT EXISTS "sent_emails" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "candidate_id"    uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "template_id"     uuid REFERENCES "email_templates"("id") ON DELETE SET NULL,
  "template_name"   varchar(80) NOT NULL,
  "recipient_email" varchar(255) NOT NULL,
  "recipient_name"  varchar(200),
  "sender_user_id"  uuid REFERENCES "users"("id"),
  "sender_email"    varchar(255) NOT NULL,
  "sender_name"     varchar(200) NOT NULL,
  "subject"         varchar(200) NOT NULL,
  "body"            text NOT NULL,
  "send_status"     varchar(20) NOT NULL DEFAULT 'sent',
  "error_message"   text,
  "sent_at"         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "sent_emails_status_check" CHECK ("send_status" IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "idx_sent_emails_candidate" ON "sent_emails" ("candidate_id", "sent_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_sent_emails_tenant"    ON "sent_emails" ("tenant_id",    "sent_at" DESC);

ALTER TABLE "sent_emails" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sent_emails_tenant_isolation" ON "sent_emails" FOR ALL
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
