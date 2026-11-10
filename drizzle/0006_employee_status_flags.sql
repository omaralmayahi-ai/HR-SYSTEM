ALTER TABLE "employee_statuses" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "payroll_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "accrues_leave" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "sort_order" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_statuses" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_statuses_single_default" ON "employee_statuses" USING btree ("is_default") WHERE "employee_statuses"."is_default";--> statement-breakpoint
-- B4a (ق-14): كل حالة مستعملة بجدول الموظفين تصير مسجلة، حتى ما تبقى حالة «يتيمة» بلا إعدادات.
INSERT INTO "employee_statuses" ("name")
SELECT DISTINCT btrim("status") FROM "employees"
WHERE "status" IS NOT NULL AND btrim("status") <> ''
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "employee_statuses" ("name") VALUES ('مستمر') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- القيم الافتراضية تطابق السلوك قبل B4a حرفياً: الرواتب والتراكم = مستمر/مستمر بالخدمة/فعال،
-- ولوحة المعلومات تعدّ «متقاعد مع تمديد» فعّالاً. المدير يغيّرها بعدين من الشاشة.
UPDATE "employee_statuses" SET "is_active" = true, "payroll_eligible" = true, "accrues_leave" = true
WHERE "name" IN ('مستمر', 'مستمر بالخدمة', 'فعال');--> statement-breakpoint
UPDATE "employee_statuses" SET "is_active" = true WHERE "name" = 'متقاعد مع تمديد';--> statement-breakpoint
UPDATE "employee_statuses" SET "is_default" = true WHERE "name" = 'مستمر';--> statement-breakpoint
UPDATE "employee_statuses" SET "sort_order" = CASE "name"
  WHEN 'مستمر' THEN 10 WHEN 'مجاز' THEN 20 WHEN 'منسب' THEN 30 WHEN 'متقاعد مع تمديد' THEN 40
  WHEN 'موقوف' THEN 50 WHEN 'منقول' THEN 60 WHEN 'متقاعد' THEN 70 WHEN 'مستقيل' THEN 80 ELSE 100 END;
