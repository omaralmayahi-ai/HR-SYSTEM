-- B1b: أعمدة موجودة في قاعدة التشغيل من إصدار سابق، فيها بيانات فعلية (تقرير db:report 2026-11-09):
--   allowances_deductions: is_archived/archived_at (10 من 27 بنداً مؤرشف)، effective_date (6)، notes (3)
--   org_units: english_name (24 من 991)، is_central (26)
-- IF NOT EXISTS: لا يمس القواعد التي فيها الأعمدة، ويضيفها للتنصيبات الجديدة.
ALTER TABLE "allowances_deductions" ADD COLUMN IF NOT EXISTS "effective_date" text;--> statement-breakpoint
ALTER TABLE "allowances_deductions" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "allowances_deductions" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "allowances_deductions" ALTER COLUMN "is_archived" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "allowances_deductions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN IF NOT EXISTS "english_name" text;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN IF NOT EXISTS "is_central" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "org_units" ALTER COLUMN "is_central" SET DEFAULT false;--> statement-breakpoint
-- rules: صفر صفوف فيها قيمة (0 من 27)، ولا يستعمله الكود → يُحذف
ALTER TABLE "allowances_deductions" DROP COLUMN IF EXISTS "rules";
