ALTER TABLE "specialization_course_credits" ADD COLUMN "source_training_id" integer;--> statement-breakpoint
ALTER TABLE "specialization_course_credits" ADD COLUMN "source" text DEFAULT 'يدوي';--> statement-breakpoint
ALTER TABLE "specialization_course_credits" ADD COLUMN "is_cancelled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "specialization_course_credits" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "specialization_credits_training_unique" ON "specialization_course_credits" USING btree ("employee_id","source_training_id") WHERE "specialization_course_credits"."source_training_id" IS NOT NULL;--> statement-breakpoint
-- B6 (ق-13): «أسبوعين لكل ترفيع» صار إعداداً قابلاً للتغيير
INSERT INTO "app_settings_documents" ("key", "value", "source") VALUES ('degree_track.weeks_per_promotion', '{"weeks": 2}'::jsonb, 'default') ON CONFLICT ("key") DO NOTHING;
