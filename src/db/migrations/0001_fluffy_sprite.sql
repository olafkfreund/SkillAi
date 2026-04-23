CREATE TYPE "public"."candidate_status" AS ENUM('new', 'shortlisted', 'interviewing', 'offered', 'rejected', 'hired');--> statement-breakpoint
CREATE TYPE "public"."transcript_analysis_status" AS ENUM('pending', 'analyzing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transcript_format" AS ENUM('vtt', 'srt', 'docx', 'txt', 'pdf', 'paste');--> statement-breakpoint
CREATE TYPE "public"."transcript_platform" AS ENUM('teams', 'zoom', 'meet', 'other');--> statement-breakpoint
CREATE TYPE "public"."recommended_decision" AS ENUM('proceed', 'consider', 'decline');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" varchar(200),
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"entity_label" varchar(200),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expiry" timestamp with time zone,
	"calendar_id" varchar(500) DEFAULT 'primary',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_user_provider" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "candidate_enrichments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"web_hits" jsonb DEFAULT '[]'::jsonb,
	"github_profile" jsonb,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_enrichments_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_enrichments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_frameworks_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
ALTER TABLE "customer_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_name" varchar(100),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"website" varchar(500),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"email" varchar(255),
	"role" varchar(20) DEFAULT 'recruiter' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "interview_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid,
	"interviewer_id" uuid,
	"title" varchar(300) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"location" varchar(500),
	"meeting_url" varchar(1000),
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"slot_notes" text,
	"google_event_id" varchar(500),
	"microsoft_event_id" varchar(500),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interview_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"pack_id" uuid,
	"raw_transcript_text" text NOT NULL,
	"parsed_transcript" jsonb,
	"source_platform" "transcript_platform" DEFAULT 'other' NOT NULL,
	"source_format" "transcript_format" NOT NULL,
	"interview_date" timestamp with time zone,
	"analysis_status" "transcript_analysis_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_transcripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcript_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"overall_score" integer,
	"communication_score" integer,
	"technical_depth_score" integer,
	"problem_solving_score" integer,
	"social_fit_score" integer,
	"communication_reasoning" text,
	"technical_depth_reasoning" text,
	"problem_solving_reasoning" text,
	"social_fit_reasoning" text,
	"summary" text,
	"strengths" text[],
	"red_flags" text[],
	"recommended_decision" "recommended_decision",
	"question_responses" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_analyses_transcript_unique" UNIQUE("transcript_id")
);
--> statement-breakpoint
ALTER TABLE "transcript_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "linkedin_url" varchar(500);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "github_username" varchar(100);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "status" "candidate_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "framework_level_id" varchar(50);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "framework_level_label" varchar(200);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "key_skills" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "top_requirements" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "is_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_enrichments" ADD CONSTRAINT "candidate_enrichments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_enrichments" ADD CONSTRAINT "candidate_enrichments_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_frameworks" ADD CONSTRAINT "customer_frameworks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_frameworks" ADD CONSTRAINT "customer_frameworks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_pack_id_interview_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."interview_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_analyses" ADD CONSTRAINT "transcript_analyses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_analyses" ADD CONSTRAINT "transcript_analyses_transcript_id_interview_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."interview_transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_created" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_interview_slots_candidate" ON "interview_slots" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_interview_slots_tenant" ON "interview_slots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_interview_transcripts_tenant" ON "interview_transcripts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_interview_transcripts_candidate" ON "interview_transcripts" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_interview_transcripts_pack" ON "interview_transcripts" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "idx_transcript_analyses_tenant" ON "transcript_analyses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_transcript_analyses_transcript" ON "transcript_analyses" USING btree ("transcript_id");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "users_tenant_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "users_auth_lookup" ON "users" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.tenant_id', true) IS NULL OR current_setting('app.tenant_id', true) = '');--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs" AS PERMISSIVE FOR ALL TO public USING ("audit_logs"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "enrichments_tenant_isolation" ON "candidate_enrichments" AS PERMISSIVE FOR ALL TO public USING ("candidate_enrichments"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "customer_frameworks_tenant_isolation" ON "customer_frameworks" AS PERMISSIVE FOR ALL TO public USING ("customer_frameworks"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "customers_tenant_isolation" ON "customers" AS PERMISSIVE FOR ALL TO public USING ("customers"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "interview_slots_tenant" ON "interview_slots" AS PERMISSIVE FOR ALL TO public USING ("interview_slots"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("interview_slots"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "interview_transcripts_tenant_isolation" ON "interview_transcripts" AS PERMISSIVE FOR ALL TO public USING ("interview_transcripts"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "transcript_analyses_tenant_isolation" ON "transcript_analyses" AS PERMISSIVE FOR ALL TO public USING ("transcript_analyses"."tenant_id" = current_setting('app.tenant_id', true)::uuid);