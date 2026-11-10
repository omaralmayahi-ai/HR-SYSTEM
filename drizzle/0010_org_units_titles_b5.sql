ALTER TABLE "employees" ADD COLUMN "org_unit_id" integer;--> statement-breakpoint
ALTER TABLE "job_titles" ADD COLUMN "grade_max" integer;--> statement-breakpoint
ALTER TABLE "job_titles" ADD COLUMN "legal_basis" text;--> statement-breakpoint
ALTER TABLE "job_titles" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "job_titles" ADD COLUMN "valid_to" date;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "org_units" ADD COLUMN "valid_to" date;--> statement-breakpoint
-- B5: المفاتيح الأجنبية NOT VALID (ما تفحص الصفوف القديمة؛ تقرير الأيتام بـ db:report)
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_units"("id") ON DELETE RESTRICT NOT VALID;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_unit_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT NOT VALID;--> statement-breakpoint
CREATE INDEX "employees_org_unit_idx" ON "employees" ("org_unit_id");--> statement-breakpoint
-- الدرجة 1 أعلى درجة: الدرجة العليا للعنوان (grade_max) رقمها أصغر من أو يساوي الدنيا (min_grade)
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_grade_range" CHECK ("grade_max" IS NULL OR "min_grade" IS NULL OR "grade_max" <= "min_grade") NOT VALID;--> statement-breakpoint
-- رمز ثابت لكل وحدة بلا رمز
UPDATE "org_units" SET "code" = 'OU-' || lpad("id"::text, 4, '0') WHERE "code" IS NULL OR btrim("code") = '';--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_units WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX org_units_code_key ON org_units (code) WHERE code IS NOT NULL;
  ELSE
    RAISE NOTICE 'org_units: رموز مكررة، ما أُنشئ فهرس التفرد';
  END IF;
END $$;--> statement-breakpoint
-- ربط الموظفين بوحداتهم: الشعبة محفوظة كمسار كامل («أ / ب / ج») = getHierarchyChain بالواجهة.
-- ما يُسجَّل بالسجل المؤرخ (ربط تقني لا تغيير وظيفي).
SELECT set_config('hr.skip_history', '1', true);--> statement-breakpoint
WITH RECURSIVE chain AS (
  SELECT u.id, u.name::text AS path FROM org_units u
  WHERE u.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM org_units p WHERE p.id = u.parent_id)
  UNION ALL
  SELECT c.id, ch.path || ' / ' || c.name FROM org_units c JOIN chain ch ON c.parent_id = ch.id
), uniq AS (
  SELECT path, min(id) AS id FROM chain GROUP BY path HAVING count(*) = 1
)
UPDATE employees e SET org_unit_id = uniq.id FROM uniq
WHERE e.org_unit_id IS NULL AND btrim(e.section) = uniq.path;--> statement-breakpoint
-- احتياطي: القسم باسم وحدة وحيدة بهذا الاسم
UPDATE employees e SET org_unit_id = u.id
FROM (SELECT name, min(id) AS id FROM org_units GROUP BY name HAVING count(*) = 1) u
WHERE e.org_unit_id IS NULL AND btrim(e.department) = btrim(u.name);
