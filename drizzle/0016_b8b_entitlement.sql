CREATE TABLE "entitlement_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"nominal_pct" numeric(7, 4) NOT NULL,
	"held_pct" numeric(7, 4) DEFAULT '0' NOT NULL,
	"default_behavior" text DEFAULT 'يتبع' NOT NULL,
	"item_behaviors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retirement" text DEFAULT 'على المستحق' NOT NULL,
	"precedence" integer DEFAULT 10 NOT NULL,
	"verification" text DEFAULT 'يُتحقق' NOT NULL,
	"legal_basis" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_states_code_key" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "entitlement_state_id" integer;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "entitlement_state_id" integer;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD CONSTRAINT "employee_statuses_state_fkey" FOREIGN KEY ("entitlement_state_id") REFERENCES "public"."entitlement_states"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_state_fkey" FOREIGN KEY ("entitlement_state_id") REFERENCES "public"."entitlement_states"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "entitlement_states" ADD CONSTRAINT "entitlement_states_pct_check" CHECK ("nominal_pct" BETWEEN 0 AND 100 AND "held_pct" BETWEEN 0 AND 100 AND "nominal_pct" + "held_pct" <= 100);--> statement-breakpoint
ALTER TABLE "entitlement_states" ADD CONSTRAINT "entitlement_states_behavior_check" CHECK ("default_behavior" IN ('يتبع', 'كامل', 'يتوقف', 'الثابتة فقط'));--> statement-breakpoint
ALTER TABLE "entitlement_states" ADD CONSTRAINT "entitlement_states_retirement_check" CHECK ("retirement" IN ('على المستحق', 'لا تُستوفى'));--> statement-breakpoint
ALTER TABLE "entitlement_states" ADD CONSTRAINT "entitlement_states_verification_check" CHECK ("verification" IN ('مؤكد', 'يُتحقق'));--> statement-breakpoint
-- جدول 9.3 بقيمه وحالات تحققه (مب8). «دوام» ضمني: اليوم بلا حالة = 100%.
INSERT INTO "entitlement_states" ("code", "name", "nominal_pct", "held_pct", "default_behavior", "item_behaviors", "retirement", "precedence", "verification", "legal_basis") VALUES
  ('FULL_LEAVE', 'إجازة براتب تام', 100, 0, 'كامل', '{"OVERTIME": "يتوقف"}', 'على المستحق', 10, 'مؤكد', 'ت18'),
  ('SICK_FULL', 'مرضية براتب تام', 100, 0, 'كامل', '{"OVERTIME": "يتوقف"}', 'على المستحق', 12, 'مؤكد', 'ت18 (المادة 46)'),
  ('HALF_PAY', 'نصف راتب', 50, 0, 'يتبع', '{}', 'على المستحق', 20, 'يُتحقق', 'ت18 (المادة 46)، ت14 — سلوك المخصصات يُتحقق'),
  ('MATERNITY', 'الحمل والوضع', 100, 0, 'كامل', '{}', 'على المستحق', 14, 'مؤكد', 'ت18'),
  ('FIXED_ONLY', 'الراتب والمخصصات الثابتة فقط', 100, 0, 'الثابتة فقط', '{}', 'على المستحق', 16, 'يُتحقق', 'طريقة صرف نوع الإجازة'),
  ('UNPAID', 'بدون راتب', 0, 0, 'يتوقف', '{}', 'لا تُستوفى', 30, 'يُتحقق', 'ت14، ت18 — يُتحقق لكل نوع'),
  ('SUSPENSION', 'سحب اليد', 50, 50, 'يتبع', '{}', 'على المستحق', 40, 'مؤكد', 'ت14، ت17'),
  ('ABSENCE', 'غياب بدون عذر', 0, 0, 'يتوقف', '{}', 'لا تُستوفى', 50, 'يُتحقق', 'ت14 — أثره على المخصصات يُتحقق'),
  ('SALARY_CUT', 'قطع الراتب (عقوبة)', 0, 0, 'يتوقف', '{}', 'لا تُستوفى', 60, 'يُتحقق', 'ت16 — «القسط اليومي من الراتب» يُتحقق');--> statement-breakpoint
-- ربط أنواع الإجازات بحالاتها مبدئياً من «طريقة صرف الراتب» (ق-17)؛ المدير يعدّل
-- الأعمدة مؤهلة باسم الجدول: «name» وحدها كانت تُقرأ من entitlement_states فيرجع الاستعلام الفرعي أكثر من صف (فشل على بيانات حقيقية)
UPDATE "leave_types" lt SET "entitlement_state_id" = (SELECT es.id FROM entitlement_states es WHERE es.code = CASE
    WHEN lt.salary_payment_type = 'بدون_راتب' THEN 'UNPAID'
    WHEN lt.salary_payment_type = 'استقطاع_جزئي' THEN 'HALF_PAY'
    WHEN lt.salary_payment_type = 'منح_الراتب_والمخصصات_الثابتة_فقط' THEN 'FIXED_ONLY'
    WHEN lt.name LIKE '%مرضي%' THEN 'SICK_FULL'
    WHEN lt.name LIKE '%أمومة%' OR lt.name LIKE '%وضع%' OR lt.name LIKE '%حمل%' THEN 'MATERNITY'
    ELSE 'FULL_LEAVE' END);--> statement-breakpoint
INSERT INTO "employee_statuses" ("name", "is_active", "payroll_eligible", "accrues_leave", "sort_order", "entitlement_state_id")
  SELECT 'مسحوب اليد', true, true, false, 90, (SELECT id FROM entitlement_states WHERE code = 'SUSPENSION')
  WHERE NOT EXISTS (SELECT 1 FROM employee_statuses WHERE name = 'مسحوب اليد');--> statement-breakpoint
UPDATE "employee_statuses" SET "entitlement_state_id" = (SELECT id FROM entitlement_states WHERE code = 'SUSPENSION') WHERE name = 'مسحوب اليد' AND entitlement_state_id IS NULL;--> statement-breakpoint
-- صرف المحجوز (س9.3) بند يدوي بأمر، شهري، مسودة
INSERT INTO "pay_items" ("code", "name", "direction", "item_group", "classification", "assignment_mode", "method", "category_id")
  SELECT 'HELD_RELEASE', 'صرف المحجوز', '+', 'أخرى', 'مؤقت', 'بأمر', 'manual', id FROM payroll_categories WHERE code = 'PERM'
  AND NOT EXISTS (SELECT 1 FROM pay_items WHERE code = 'HELD_RELEASE');--> statement-breakpoint
INSERT INTO "pay_item_versions" ("item_id", "valid_from", "props", "entered_by", "approved_by")
  SELECT i.id, '2000-01-01', '{"status": "مسودة", "verification": "مؤكد", "legal_basis": "ت17 — صرف المحجوز بعد نتيجة القضية", "monthly": true, "held_release": true, "calc_order": 90, "inside_200_cap": false}'::jsonb, 'ترحيل B8b', 'ترحيل B8b'
  FROM pay_items i WHERE i.code = 'HELD_RELEASE' AND NOT EXISTS (SELECT 1 FROM pay_item_versions v WHERE v.item_id = i.id);--> statement-breakpoint
-- تغييرات الحالات تمس الرواتب: سجل تدقيق
CREATE OR REPLACE FUNCTION entitlement_states_audit() RETURNS trigger AS $$
BEGIN
  INSERT INTO payroll_audit (actor, action, entity, entity_id, before, after)
  VALUES (coalesce(current_setting('hr.user', true), 'قاعدة البيانات'), lower(TG_OP), 'entitlement_states', coalesce(NEW.id, OLD.id)::text,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN coalesce(NEW, OLD);
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER entitlement_states_audit AFTER INSERT OR UPDATE OR DELETE ON "entitlement_states" FOR EACH ROW EXECUTE FUNCTION entitlement_states_audit();
