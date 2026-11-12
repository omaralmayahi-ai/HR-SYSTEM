CREATE TABLE "payroll_external_amounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"target" text NOT NULL,
	"amount" numeric(18, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_external_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"rows" integer NOT NULL,
	"matched" integer NOT NULL,
	"unmatched" jsonb NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"mapping" jsonb NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payroll_import_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"key_column" text NOT NULL,
	"columns" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payroll_external_amounts_import" ON "payroll_external_amounts" USING btree ("import_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_external_imports_period" ON "payroll_external_imports" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_import_profiles_name" ON "payroll_import_profiles" USING btree ("category_id","name");--> statement-breakpoint
ALTER TABLE "payroll_import_profiles" ADD CONSTRAINT "payroll_import_profiles_cat_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payroll_categories"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "payroll_external_imports" ADD CONSTRAINT "payroll_external_imports_period_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "payroll_external_imports" ADD CONSTRAINT "payroll_external_imports_profile_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."payroll_import_profiles"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "payroll_external_amounts" ADD CONSTRAINT "payroll_external_amounts_import_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."payroll_external_imports"("id") ON DELETE restrict;--> statement-breakpoint
-- المبالغ المستوردة ثابتة؛ الاستيراد يُستبدل باستيراد جديد (superseded_at فقط)
CREATE OR REPLACE FUNCTION external_amounts_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'المبالغ المستوردة ثابتة؛ استورد الملف من جديد (B8a4)'; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER external_amounts_immutable BEFORE UPDATE OR DELETE ON "payroll_external_amounts" FOR EACH ROW EXECUTE FUNCTION external_amounts_immutable();--> statement-breakpoint
CREATE OR REPLACE FUNCTION external_imports_supersede_only() RETURNS trigger AS $$
BEGIN
  -- المسموح فقط: الاستبدال (superseded_at مرة واحدة) أو التأكيد من مستخدم ثانٍ (مرة واحدة، قبل الاستبدال) — مراجعة B8a4 H2
  IF TG_OP = 'DELETE' OR OLD.superseded_at IS NOT NULL
     OR (to_jsonb(NEW) - 'superseded_at' - 'confirmed_by' - 'confirmed_at') <> (to_jsonb(OLD) - 'superseded_at' - 'confirmed_by' - 'confirmed_at')
     OR (OLD.confirmed_by IS NOT NULL AND (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at))
     OR (NEW.superseded_at IS NULL AND NEW.confirmed_by IS NULL)
     OR (NEW.superseded_at IS NOT NULL AND NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by) THEN
    RAISE EXCEPTION 'الاستيراد يُستبدل باستيراد جديد أو يُؤكَّد مرة واحدة فقط (B8a4)';
  END IF;
  IF NEW.confirmed_by IS NOT NULL AND (NEW.confirmed_by = NEW.imported_by OR NEW.confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'يؤكد الاستيراد مستخدم غير الذي استورده (B8a4)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER external_imports_supersede_only BEFORE UPDATE OR DELETE ON "payroll_external_imports" FOR EACH ROW EXECUTE FUNCTION external_imports_supersede_only();--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_external_imports_live" ON "payroll_external_imports" ("period_id") WHERE superseded_at IS NULL;
