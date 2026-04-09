CREATE TYPE "public"."file_type" AS ENUM('pdf', 'docx', 'odt', 'rtf', 'txt', 'md');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'recruiter', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."score_status" AS ENUM('pending', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('junior', 'mid', 'senior', 'lead');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('pending', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('behavioral', 'technical', 'situational', 'cultural');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agency_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"cv_text" text NOT NULL,
	"file_path" varchar(500),
	"file_type" "file_type" NOT NULL,
	"embedding" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "code_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"problem_description" text NOT NULL,
	"starter_code" text NOT NULL,
	"language" varchar(50) DEFAULT 'typescript' NOT NULL,
	"unit_tests" text,
	"evaluation_criteria" text,
	"estimated_minutes" integer,
	CONSTRAINT "code_challenges_pack_id_unique" UNIQUE("pack_id")
);
--> statement-breakpoint
ALTER TABLE "code_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'recruiter' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"requirements" text NOT NULL,
	"file_path" varchar(500),
	"created_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"score_status" "score_status" DEFAULT 'pending' NOT NULL,
	"overall_score" integer,
	"technical_score" integer,
	"experience_score" integer,
	"cultural_fit_score" integer,
	"communication_score" integer,
	"technical_reasoning" text,
	"experience_reasoning" text,
	"cultural_fit_reasoning" text,
	"communication_reasoning" text,
	"ai_summary" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_candidate_role_unique" UNIQUE("candidate_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interview_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"generation_status" "generation_status" DEFAULT 'pending' NOT NULL,
	"experience_level" "experience_level",
	"recommended_duration_minutes" integer,
	"includes_code_challenge" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_packs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"question_type" "question_type" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"question_text" text NOT NULL,
	"rationale" text,
	"follow_ups" jsonb,
	"strong_answer_signals" text[],
	"acceptable_answer_signals" text[],
	"weak_answer_signals" text[],
	"cv_references" text[],
	"order_index" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "interview_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_challenges" ADD CONSTRAINT "code_challenges_pack_id_interview_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."interview_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_packs" ADD CONSTRAINT "interview_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_packs" ADD CONSTRAINT "interview_packs_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_packs" ADD CONSTRAINT "interview_packs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_packs" ADD CONSTRAINT "interview_packs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_pack_id_interview_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."interview_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_candidates_tenant" ON "candidates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_agency" ON "candidates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_code_challenges_pack" ON "code_challenges" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "idx_scores_role_overall" ON "scores" USING btree ("role_id","overall_score");--> statement-breakpoint
CREATE INDEX "idx_scores_candidate" ON "scores" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_notes_candidate" ON "notes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_interview_packs_candidate" ON "interview_packs" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_interview_packs_role" ON "interview_packs" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_interview_questions_pack" ON "interview_questions" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_settings_lookup" ON "tenant_settings" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE POLICY "agencies_tenant_isolation" ON "agencies" AS PERMISSIVE FOR ALL TO public USING ("agencies"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "candidates_tenant_isolation" ON "candidates" AS PERMISSIVE FOR ALL TO public USING ("candidates"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "code_challenges_tenant_isolation" ON "code_challenges" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM interview_packs ip
        WHERE ip.id = "code_challenges"."pack_id"
          AND ip.tenant_id = current_setting('app.tenant_id', true)::uuid
      ));--> statement-breakpoint
CREATE POLICY "roles_tenant_isolation" ON "roles" AS PERMISSIVE FOR ALL TO public USING ("roles"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "scores_tenant_isolation" ON "scores" AS PERMISSIVE FOR ALL TO public USING ("scores"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "notes_tenant_isolation" ON "notes" AS PERMISSIVE FOR ALL TO public USING ("notes"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "interview_packs_tenant_isolation" ON "interview_packs" AS PERMISSIVE FOR ALL TO public USING ("interview_packs"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "interview_questions_tenant_isolation" ON "interview_questions" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM interview_packs ip
        WHERE ip.id = "interview_questions"."pack_id"
          AND ip.tenant_id = current_setting('app.tenant_id', true)::uuid
      ));--> statement-breakpoint
CREATE POLICY "tenant_settings_tenant_isolation" ON "tenant_settings" AS PERMISSIVE FOR ALL TO public USING ("tenant_settings"."tenant_id" = current_setting('app.tenant_id', true)::uuid);