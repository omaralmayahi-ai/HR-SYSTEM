CREATE TABLE "data_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer,
	"company_number" text NOT NULL,
	"topic" text NOT NULL,
	"issue_code" text NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"external_amount" numeric(18, 6),
	"computed_amount" numeric(18, 6),
	"status" text DEFAULT 'مفتوحة' NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"import_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"kind" text NOT NULL,
	"source_ref" text NOT NULL,
	"employee_id" integer,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"summary" jsonb NOT NULL,
	"applied_by" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_import_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."legacy_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_archive" ADD CONSTRAINT "legacy_archive_import_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."legacy_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_issues_source_ref" ON "data_issues" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "data_issues_status" ON "data_issues" USING btree ("status","topic");--> statement-breakpoint
CREATE INDEX "data_issues_employee" ON "data_issues" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_archive_ref" ON "legacy_archive" USING btree ("kind","source_ref");--> statement-breakpoint
CREATE INDEX "legacy_archive_employee" ON "legacy_archive" USING btree ("employee_id");--> statement-breakpoint
ALTER TABLE "legacy_archive" ADD CONSTRAINT "legacy_archive_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_status_check" CHECK (status IN ('مفتوحة', 'قيد المراجعة', 'محلولة', 'مستبعدة'));--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_resolution_check" CHECK (status NOT IN ('محلولة', 'مستبعدة') OR (length(btrim(coalesce(resolution, ''))) > 0 AND length(btrim(coalesce(resolved_by, ''))) > 0 AND resolved_at IS NOT NULL));--> statement-breakpoint
-- سجل الترحيل والأرشيف ثابتان
CREATE OR REPLACE FUNCTION legacy_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'سجلات الترحيل والأرشيف ثابتة (C)'; END $$ LANGUAGE plpgsql;--> statement-breakpoint
-- الملخص يُكتب مرة واحدة بنهاية معاملة الترحيل (الصف يُنشأ أولاً حتى ترتبط به الحالات والأرشيف)
CREATE OR REPLACE FUNCTION legacy_imports_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.summary = '{}'::jsonb AND NEW.summary <> '{}'::jsonb AND (to_jsonb(NEW) - 'summary') = (to_jsonb(OLD) - 'summary') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'سجلات الترحيل ثابتة (C)';
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER legacy_imports_immutable BEFORE UPDATE OR DELETE ON "legacy_imports" FOR EACH ROW EXECUTE FUNCTION legacy_imports_guard();--> statement-breakpoint
CREATE TRIGGER legacy_archive_immutable BEFORE UPDATE OR DELETE ON "legacy_archive" FOR EACH ROW EXECUTE FUNCTION legacy_immutable();--> statement-breakpoint
CREATE TRIGGER legacy_imports_no_truncate BEFORE TRUNCATE ON "legacy_imports" FOR EACH STATEMENT EXECUTE FUNCTION legacy_immutable();--> statement-breakpoint
CREATE TRIGGER legacy_archive_no_truncate BEFORE TRUNCATE ON "legacy_archive" FOR EACH STATEMENT EXECUTE FUNCTION legacy_immutable();--> statement-breakpoint
-- الحالة ما تُحذف، ويتغير فيها الوضع والقرار فقط؛ والقرار يُدقَّق
CREATE OR REPLACE FUNCTION data_issues_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'حالات الاستفسار ما تُحذف؛ استبعدها بقرار (C)'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'resolution' - 'resolved_by' - 'resolved_at') <> (to_jsonb(OLD) - 'status' - 'resolution' - 'resolved_by' - 'resolved_at') THEN
    RAISE EXCEPTION 'يتغير بحالة الاستفسار وضعها وقرارها فقط (C)';
  END IF;
  INSERT INTO payroll_audit (actor, action, entity, entity_id, before, after)
    VALUES (coalesce(nullif(current_setting('app.actor', true), ''), NEW.resolved_by, current_user), 'تحديث حالة استفسار', 'data_issues', NEW.id::text,
      jsonb_build_object('status', OLD.status, 'resolution', OLD.resolution), jsonb_build_object('status', NEW.status, 'resolution', NEW.resolution));
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER data_issues_guard BEFORE UPDATE OR DELETE ON "data_issues" FOR EACH ROW EXECUTE FUNCTION data_issues_guard();--> statement-breakpoint
CREATE TRIGGER data_issues_no_truncate BEFORE TRUNCATE ON "data_issues" FOR EACH STATEMENT EXECUTE FUNCTION legacy_immutable();--> statement-breakpoint
-- ق-C3 (افتراضي): ملف تعريف جاهز لكشف الرواتب بصيغة نظام المخصصات (sno، basic، m681، m802)
INSERT INTO "payroll_import_profiles" ("category_id", "name", "key_column", "columns", "created_by")
SELECT c.id, 'كشف الرواتب (صيغة Access)', 'sno',
  jsonb_build_array(jsonb_build_object('header', 'basic', 'target', 'NOMINAL'), jsonb_build_object('header', 'm681', 'target', 'CERT'), jsonb_build_object('header', 'm802', 'target', 'FAMILY')),
  'ترحيل C'
FROM payroll_categories c WHERE c.code = 'PERM'
  AND EXISTS (SELECT 1 FROM pay_items WHERE code = 'CERT') AND EXISTS (SELECT 1 FROM pay_items WHERE code = 'FAMILY')
ON CONFLICT ("category_id", "name") DO NOTHING;
