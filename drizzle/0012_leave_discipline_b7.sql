CREATE TABLE "official_holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'ميلادي ثابت' NOT NULL,
	"legal_basis" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commendation_types" ADD COLUMN "applies_to" text DEFAULT 'كلاهما' NOT NULL;--> statement-breakpoint
ALTER TABLE "commendation_types" ADD COLUMN "annual_cap" integer;--> statement-breakpoint
ALTER TABLE "employee_commendations" ADD COLUMN "applies_to_snapshot" text DEFAULT 'كلاهما' NOT NULL;--> statement-breakpoint
ALTER TABLE "penalties" ADD COLUMN "delay_months" integer;--> statement-breakpoint
ALTER TABLE "penalties" ADD COLUMN "cancel_order_number" text;--> statement-breakpoint
ALTER TABLE "penalties" ADD COLUMN "cancel_order_date" text;--> statement-breakpoint
ALTER TABLE "penalties" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "official_holidays_date_name" ON "official_holidays" USING btree ("holiday_date","name");--> statement-breakpoint
ALTER TABLE "commendation_types" ADD CONSTRAINT "commendation_types_applies_to_check" CHECK ("applies_to" IN ('كلاهما', 'علاوة', 'ترفيع'));--> statement-breakpoint
ALTER TABLE "employee_commendations" ADD CONSTRAINT "employee_commendations_applies_to_check" CHECK ("applies_to_snapshot" IN ('كلاهما', 'علاوة', 'ترفيع'));--> statement-breakpoint
ALTER TABLE "official_holidays" ADD CONSTRAINT "official_holidays_kind_check" CHECK ("kind" IN ('ميلادي ثابت', 'هجري', 'طارئ', 'ديني خاص'));--> statement-breakpoint
-- لقطة أشهر التأخير للعقوبات الموجودة من إعداداتها الحالية (نفس النتيجة الحالية؛ تتثبت من الآن).
-- قطع الراتب وتنزيل الدرجة مستثنيان لأن تأخيرهما يُحسب من أيام القطع أو حركة منفصلة.
-- المطابقة بنفس تطبيع المحرك (normalizePenaltyName): حذف الأقواس، توحيد الألف، المسافات، «ال» البادئة.
-- عند تكرار الاسم بالإعدادات يُعتمد أقدم سجل (نفس ترتيب المحرك).
WITH t AS (
  SELECT DISTINCT ON (k) k, "delay_months" FROM (
    SELECT regexp_replace(btrim(regexp_replace(translate(regexp_replace("name", '\(.*?\)', '', 'g'), 'إأآ', 'ااا'), '\s+', ' ', 'g')), '^ال', '') AS k, "delay_months", "id" FROM "penalty_types" WHERE "delay_months" IS NOT NULL
  ) x ORDER BY k, "id"
)
UPDATE "penalties" p SET "delay_months" = t."delay_months"
FROM t
WHERE p."delay_months" IS NULL AND regexp_replace(btrim(regexp_replace(translate(regexp_replace(p."penalty_type", '\(.*?\)', '', 'g'), 'إأآ', 'ااا'), '\s+', ' ', 'g')), '^ال', '') = t.k
  AND p."penalty_type" NOT LIKE '%قطع%' AND p."penalty_type" NOT LIKE '%تنزيل%';--> statement-breakpoint
-- العطل الميلادية الثابتة بقانون العطل الرسمية رقم 12 لسنة 2024 لسنتي 2026 و2027.
-- العطل الهجرية والطارئة يدخلها المسؤول سنوياً (ق-12). «اليوم الوطني 3 تشرين الأول» ما أُدرج لأنه يحتاج تحقق.
INSERT INTO "official_holidays" ("holiday_date", "name", "kind", "legal_basis")
SELECT make_date(y, m, d), n, 'ميلادي ثابت', 'قانون العطل الرسمية رقم 12 لسنة 2024'
FROM (VALUES (1, 1, 'رأس السنة الميلادية'), (1, 6, 'عيد الجيش العراقي'), (3, 16, 'ذكرى جرائم البعث'),
             (3, 21, 'عيد نوروز'), (5, 1, 'عيد العمال العالمي'), (12, 10, 'يوم النصر العراقي'),
             (12, 25, 'عيد الميلاد المجيد')) AS h(m, d, n),
     (VALUES (2026), (2027)) AS yy(y)
ON CONFLICT DO NOTHING;
