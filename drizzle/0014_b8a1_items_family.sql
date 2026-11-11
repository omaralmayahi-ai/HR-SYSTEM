CREATE TABLE "employee_pay_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value_kind" text,
	"value" numeric(18, 6),
	"valid_from" date NOT NULL,
	"valid_to" date,
	"principal" numeric(18, 6),
	"installment" numeric(18, 6),
	"installments_count" integer,
	"multi_allowed" boolean DEFAULT false NOT NULL,
	"order_id" integer NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" integer,
	"entered_by" text,
	"approved_by" text
);
--> statement-breakpoint
CREATE TABLE "family_extensions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"order_id" integer,
	"reason" text,
	"source" text DEFAULT 'أمر' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text
);
--> statement-breakpoint
CREATE TABLE "family_member_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"fact" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" date,
	"order_id" integer,
	"source" text NOT NULL,
	"reason" text,
	"supersedes_id" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"relation" text NOT NULL,
	"name" text,
	"birth_date" date,
	"spouse_employee_id" integer,
	"source_ref" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_item_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"props" jsonb NOT NULL,
	"order_id" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" integer,
	"entered_by" text,
	"approved_by" text,
	"published_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "pay_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"item_group" text NOT NULL,
	"classification" text NOT NULL,
	"assignment_mode" text NOT NULL,
	"method" text NOT NULL,
	"category_id" integer NOT NULL,
	"payroll_code" text,
	"beneficiary" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_items_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payroll_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"pay_basis" text DEFAULT 'شهري' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_categories_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payroll_category_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_type" text NOT NULL,
	"contract_type" text,
	"category_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"op_type" text NOT NULL,
	"employee_id" integer,
	"item_id" integer,
	"payload" jsonb NOT NULL,
	"base_token" text,
	"summary" text,
	"entered_by" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'بانتظار' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"result_ref" text
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "family_mode" text;--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_item_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."pay_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_extensions" ADD CONSTRAINT "family_extensions_member_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_extensions" ADD CONSTRAINT "family_extensions_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_facts" ADD CONSTRAINT "family_member_facts_member_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_facts" ADD CONSTRAINT "family_member_facts_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_facts" ADD CONSTRAINT "family_member_facts_supersedes_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."family_member_facts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_spouse_employee_fkey" FOREIGN KEY ("spouse_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_versions" ADD CONSTRAINT "pay_item_versions_item_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."pay_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_versions" ADD CONSTRAINT "pay_item_versions_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_category_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payroll_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_category_rules" ADD CONSTRAINT "payroll_category_rules_category_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payroll_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_pay_assignments_emp" ON "employee_pay_assignments" USING btree ("employee_id","item_id");--> statement-breakpoint
CREATE INDEX "family_member_facts_member" ON "family_member_facts" USING btree ("member_id","fact");--> statement-breakpoint
CREATE INDEX "family_members_employee" ON "family_members" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "pay_item_versions_item" ON "pay_item_versions" USING btree ("item_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_category_rules_key" ON "payroll_category_rules" USING btree ("service_type",coalesce("contract_type", ''));--> statement-breakpoint
CREATE INDEX "pending_operations_state" ON "pending_operations" USING btree ("state","entered_at");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_direction_check" CHECK ("direction" IN ('+', '-'));--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_classification_check" CHECK ("classification" IN ('عام', 'ثابت', 'تقديري', 'مؤقت'));--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_mode_check" CHECK ("assignment_mode" IN ('تلقائي', 'بأمر'));--> statement-breakpoint
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_method_check" CHECK ("method" IN ('percent', 'flat', 'tiered', 'family', 'installments', 'manual', 'brackets', 'hours'));--> statement-breakpoint
ALTER TABLE "pay_item_versions" ADD CONSTRAINT "pay_item_versions_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");--> statement-breakpoint
ALTER TABLE "pay_item_versions" ADD CONSTRAINT "pay_item_versions_no_overlap"
  EXCLUDE USING gist ("item_id" WITH =, daterange("valid_from", "valid_to" + 1, '[)') WITH &&) WHERE ("superseded_at" IS NULL);--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_kind_check" CHECK ("kind" IN ('منح', 'تعديل', 'حجب'));--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");--> statement-breakpoint
ALTER TABLE "employee_pay_assignments" ADD CONSTRAINT "employee_pay_assignments_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, "item_id" WITH =, daterange("valid_from", "valid_to" + 1, '[)') WITH &&)
  WHERE ("superseded_at" IS NULL AND NOT "multi_allowed");--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_relation_check" CHECK ("relation" IN ('زوج', 'زوجة', 'زوج/زوجة', 'ابن', 'بنت', 'طفل'));--> statement-breakpoint
ALTER TABLE "family_extensions" ADD CONSTRAINT "family_extensions_range_check" CHECK ("valid_to" >= "valid_from");--> statement-breakpoint
ALTER TABLE "pending_operations" ADD CONSTRAINT "pending_operations_state_check" CHECK ("state" IN ('بانتظار', 'معتمد', 'مرفوض', 'ملغى'));--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_family_mode_check" CHECK ("family_mode" IS NULL OR "family_mode" IN ('كامل', 'الأطفال فقط', 'محجوب', 'لا يستحق'));--> statement-breakpoint

-- النسخ والإسنادات: الصف المعتمد ما يتعدل؛ يُستبدل فقط (superseded_at/by) أو يُعلَّم منشوراً
CREATE OR REPLACE FUNCTION payroll_supersede_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% append-only: يُستبدل ولا يُحذف (B8a1)', TG_TABLE_NAME; END IF;
  IF OLD.superseded_at IS NOT NULL THEN
    -- المسموح الوحيد: ربط المُستبدِل بعد إدراجه (superseded_by من فارغ)
    IF OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL
       AND (to_jsonb(NEW) - 'superseded_by') = (to_jsonb(OLD) - 'superseded_by') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '% صف مُستبدل ما يتعدل (B8a1)', TG_TABLE_NAME;
  END IF;
  IF NEW.superseded_by IS NOT NULL AND NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION '% superseded_by بلا superseded_at (B8a1)', TG_TABLE_NAME;
  END IF;
  IF (to_jsonb(NEW) - 'superseded_at' - 'superseded_by' - 'published_at') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_at' - 'superseded_by' - 'published_at') THEN
    RAISE EXCEPTION '% يُستبدل ولا يتعدل (B8a1)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER pay_item_versions_supersede_only BEFORE UPDATE OR DELETE ON "pay_item_versions" FOR EACH ROW EXECUTE FUNCTION payroll_supersede_only();--> statement-breakpoint
CREATE TRIGGER employee_pay_assignments_supersede_only BEFORE UPDATE OR DELETE ON "employee_pay_assignments" FOR EACH ROW EXECUTE FUNCTION payroll_supersede_only();--> statement-breakpoint

CREATE OR REPLACE FUNCTION family_facts_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% append-only (B8a1)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER family_member_facts_append_only BEFORE UPDATE OR DELETE ON "family_member_facts" FOR EACH ROW EXECUTE FUNCTION family_facts_append_only();--> statement-breakpoint
CREATE TRIGGER family_extensions_append_only BEFORE UPDATE OR DELETE ON "family_extensions" FOR EACH ROW EXECUTE FUNCTION family_facts_append_only();--> statement-breakpoint

-- نمط الاستحقاق العائلي حقل متتبَّع بالسجل المؤرخ
CREATE OR REPLACE FUNCTION employee_history_capture() RETURNS trigger AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Baghdad')::date;
  reason text := NULLIF(current_setting('hr.reason', true), '');
  by_user text := NULLIF(current_setting('hr.user', true), '');
  ctx_eff date := hr_try_date(NULLIF(current_setting('hr.effective_date', true), ''));
  corr boolean := COALESCE(current_setting('hr.correction', true), '') = '1';
  corr_fields text[] := string_to_array(NULLIF(current_setting('hr.correction_fields', true), ''), ',');
  snap jsonb := to_jsonb(OLD) - 'photo';
  order_id integer := NULL;
  src text := 'تعديل مباشر';
  f text; old_v jsonb; new_v jsonb; eff date; known date;
  live_id integer; live_from date; live_order integer;
BEGIN
  IF COALESCE(current_setting('hr.skip_history', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NULLIF(btrim(NEW.status_order_number), '') IS NOT NULL THEN
    INSERT INTO administrative_orders (order_number, order_date, order_kind, created_by)
    VALUES (btrim(NEW.status_order_number), COALESCE(hr_try_date(NEW.status_order_date), today), 'تغيير حالة', by_user)
    ON CONFLICT (order_number, order_date, coalesce(issuer, '')) DO NOTHING;
    SELECT id INTO order_id FROM administrative_orders
     WHERE order_number = btrim(NEW.status_order_number)
       AND order_date = COALESCE(hr_try_date(NEW.status_order_date), today)
       AND issuer IS NULL
     LIMIT 1;
  END IF;

  FOREACH f IN ARRAY ARRAY['grade','step','job_title','department','section','work_location','status','service_type',
                           'primary_responsibility','acting_responsibility','education_level','marital_status','gender',
                           'org_unit_id','contract_type','free_transport','risk_exposure','family_mode'] LOOP
    old_v := to_jsonb(OLD) -> f;
    new_v := to_jsonb(NEW) -> f;
    IF old_v IS NOT DISTINCT FROM new_v THEN CONTINUE; END IF;
    IF (old_v IS NULL OR old_v = 'null'::jsonb OR old_v = '""'::jsonb) AND (new_v IS NULL OR new_v = 'null'::jsonb OR new_v = '""'::jsonb) THEN CONTINUE; END IF;

    IF corr AND (corr_fields IS NULL OR f = ANY(corr_fields)) THEN
      live_id := NULL; live_from := NULL; live_order := NULL;
      SELECT t.id, t.valid_from, t.order_id INTO live_id, live_from, live_order
        FROM employee_field_timeline t
       WHERE t.employee_id = OLD.id AND t.field = f AND (t.valid_from IS NULL OR t.valid_from <= today)
       ORDER BY t.valid_from DESC NULLS LAST, t.recorded_at DESC, t.id DESC
       LIMIT 1;
      IF live_id IS NULL AND old_v IS NOT NULL AND old_v <> 'null'::jsonb AND old_v <> '""'::jsonb THEN
        INSERT INTO employee_field_history (employee_id, field, value, valid_from, source, reason, snapshot, recorded_by)
        VALUES (OLD.id, f, old_v, NULL, 'تقديري', 'سجل أساس قبل التصحيح', snap, by_user)
        RETURNING id INTO live_id;
      END IF;
      INSERT INTO employee_field_history (employee_id, field, value, valid_from, order_id, source, reason, snapshot, supersedes_id, recorded_by)
      VALUES (OLD.id, f, CASE WHEN new_v = '""'::jsonb THEN 'null'::jsonb ELSE new_v END, live_from, live_order,
              'تصحيح', COALESCE(reason, 'تصحيح خطأ إدخال'), snap, live_id, by_user);
      CONTINUE;
    END IF;

    eff := CASE f
      WHEN 'grade' THEN CASE WHEN NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date THEN hr_try_date(NEW.last_promotion_date)
                             WHEN NEW.grade_date IS DISTINCT FROM OLD.grade_date THEN hr_try_date(NEW.grade_date) END
      WHEN 'step' THEN CASE WHEN NEW.last_increment_date IS DISTINCT FROM OLD.last_increment_date THEN hr_try_date(NEW.last_increment_date)
                            WHEN NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date THEN hr_try_date(NEW.last_promotion_date) END
      WHEN 'status' THEN CASE WHEN NEW.status_order_date IS DISTINCT FROM OLD.status_order_date THEN hr_try_date(NEW.status_order_date) END
      ELSE NULL END;
    eff := COALESCE(eff, ctx_eff, today);

    IF old_v IS NOT NULL AND old_v <> 'null'::jsonb AND old_v <> '""'::jsonb
       AND NOT EXISTS (SELECT 1 FROM employee_field_history h WHERE h.employee_id = OLD.id AND h.field = f) THEN
      known := CASE f
        WHEN 'grade' THEN COALESCE(hr_try_date(OLD.grade_date), hr_try_date(OLD.last_promotion_date))
        WHEN 'step' THEN hr_try_date(OLD.last_increment_date)
        WHEN 'status' THEN hr_try_date(OLD.status_order_date)
        ELSE NULL END;
      INSERT INTO employee_field_history (employee_id, field, value, valid_from, source, reason, snapshot, recorded_by)
      VALUES (OLD.id, f, old_v, CASE WHEN known < eff THEN known END, 'تقديري', 'سجل أساس تقديري (ق-4)', snap, by_user);
    END IF;

    INSERT INTO employee_field_history (employee_id, field, value, valid_from, order_id, source, reason, snapshot, recorded_by)
    VALUES (OLD.id, f, CASE WHEN new_v = '""'::jsonb THEN 'null'::jsonb ELSE new_v END, eff,
            CASE WHEN f = 'status' THEN order_id END,
            CASE WHEN f = 'status' AND order_id IS NOT NULL THEN 'أمر' ELSE src END,
            reason, snap, by_user);
  END LOOP;

  IF (NOT corr OR (corr_fields IS NOT NULL AND NOT ('grade' = ANY(corr_fields)))) AND NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date AND NEW.grade IS NOT DISTINCT FROM OLD.grade THEN
    INSERT INTO employee_field_history (employee_id, field, value, valid_from, source, reason, snapshot, recorded_by)
    VALUES (OLD.id, 'event', to_jsonb('تغيير تاريخ آخر ترفيع إلى ' || COALESCE(NEW.last_promotion_date, 'فارغ')),
            COALESCE(hr_try_date(NEW.last_promotion_date), today), src, reason, snap, by_user);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;;--> statement-breakpoint

-- فئات الرواتب (ق-1): الدائميون فعّالة، والعقود والأجر اليومي تُبنى بنودها لاحقاً
INSERT INTO "payroll_categories" ("code", "name", "kind", "pay_basis", "is_active", "notes") VALUES
  ('PERM', 'رواتب الموظفين الدائميين', 'دائم', 'شهري', true, 'قانون رواتب موظفي الدولة 22 لسنة 2008'),
  ('CONTRACT', 'رواتب العقود', 'عقد', 'شهري', false, 'لكل نوع عقد سياسة تُبنى مستقلة (ق-1)'),
  ('DAILY', 'الأجور اليومية', 'أجر يومي', 'يومي', false, 'تُبنى سياستها مستقلة (ق-1)');--> statement-breakpoint
INSERT INTO "payroll_category_rules" ("service_type", "contract_type", "category_id")
  SELECT 'دائم', NULL, id FROM payroll_categories WHERE code = 'PERM'
  UNION ALL SELECT 'عقد', NULL, id FROM payroll_categories WHERE code = 'CONTRACT'
  UNION ALL SELECT 'أجر يومي', NULL, id FROM payroll_categories WHERE code = 'DAILY';--> statement-breakpoint

-- العائلة: من JSON الموظف إلى جداول مؤرخة (المصدر «ترحيل قديم»، والتواريخ المجهولة فارغة)
CREATE OR REPLACE FUNCTION hr_try_jsonb(v text) RETURNS jsonb AS $$
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  RETURN v::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint
INSERT INTO "family_members" ("employee_id", "relation", "name", "birth_date", "source_ref")
SELECT e.id,
  CASE WHEN lower(btrim(COALESCE(c->>'gender', ''))) IN ('أنثى', 'انثى', 'بنت', 'female', 'f') THEN 'بنت'
       ELSE 'طفل' END, -- «ذكر» كان القيمة الافتراضية بالاستمارة القديمة، فما يُعتمد دليلاً؛ يُراجع بفحص الجودة
  NULLIF(btrim(c->>'name'), ''), hr_try_date(COALESCE(c->>'birth_date', c->>'birthDate', c->>'dob')),
  'children_details#' || t.ord
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(hr_try_jsonb(e.children_details)) = 'array' THEN hr_try_jsonb(e.children_details) ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c, ord)
WHERE jsonb_typeof(c) = 'object';--> statement-breakpoint
INSERT INTO "family_member_facts" ("member_id", "fact", "value", "valid_from", "source", "reason")
SELECT m.id, f.fact, f.val, NULL, 'ترحيل قديم', 'من بيانات الطفل القديمة'
FROM family_members m
JOIN employees e ON e.id = m.employee_id
CROSS JOIN LATERAL (SELECT c FROM jsonb_array_elements(hr_try_jsonb(e.children_details)) WITH ORDINALITY AS t(c, ord)
                    WHERE 'children_details#' || t.ord = m.source_ref) j
CROSS JOIN LATERAL (VALUES
  ('متوفى', CASE WHEN (j.c->>'is_deceased') IN ('true', 'نعم') OR (j.c->>'isDeceased') = 'true' THEN 'true'::jsonb END),
  ('متزوج', CASE WHEN (j.c->>'is_married') = 'true' OR (j.c->>'marital_status') IN ('متزوجة', 'متزوج') THEN 'true'::jsonb
                 WHEN (j.c->>'is_married') = 'false' OR (j.c->>'marital_status') IN ('عزباء', 'غير متزوجة', 'أعزب') THEN 'false'::jsonb END),
  ('موظف', CASE WHEN (j.c->>'is_employed') IN ('true', 'نعم', 'موظفة') THEN 'true'::jsonb
                WHEN (j.c->>'is_employed') IN ('false', 'لا', 'غير موظفة') THEN 'false'::jsonb END)
) AS f(fact, val)
WHERE f.val IS NOT NULL;--> statement-breakpoint
INSERT INTO "family_extensions" ("member_id", "valid_from", "valid_to", "reason", "source")
SELECT m.id, hr_try_date(COALESCE(j.c->>'extension_start_date', j.c->>'extensionStartDate')),
       hr_try_date(COALESCE(j.c->>'extension_end_date', j.c->>'extensionEndDate')),
       'أمر تمديد ' || COALESCE(j.c->>'extension_order_number', j.c->>'extensionOrderNumber', ''), 'ترحيل قديم'
FROM family_members m
JOIN employees e ON e.id = m.employee_id
CROSS JOIN LATERAL (SELECT c FROM jsonb_array_elements(hr_try_jsonb(e.children_details)) WITH ORDINALITY AS t(c, ord)
                    WHERE 'children_details#' || t.ord = m.source_ref) j
WHERE hr_try_date(COALESCE(j.c->>'extension_start_date', j.c->>'extensionStartDate')) IS NOT NULL
  AND hr_try_date(COALESCE(j.c->>'extension_end_date', j.c->>'extensionEndDate')) >= hr_try_date(COALESCE(j.c->>'extension_start_date', j.c->>'extensionStartDate'))
  AND NULLIF(COALESCE(j.c->>'extension_order_number', j.c->>'extensionOrderNumber'), '') IS NOT NULL;--> statement-breakpoint
INSERT INTO "family_members" ("employee_id", "relation", "name", "source_ref")
SELECT e.id, CASE WHEN e.gender IN ('أنثى', 'انثى') THEN 'زوج' WHEN e.gender = 'ذكر' THEN 'زوجة' ELSE 'زوج/زوجة' END, NULLIF(btrim(COALESCE(s->>'name', s #>> '{}')), ''), 'spouses_data#' || t.ord
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(hr_try_jsonb(e.spouses_data)) = 'array' THEN hr_try_jsonb(e.spouses_data) ELSE '[]'::jsonb END) WITH ORDINALITY AS t(s, ord)
WHERE NULLIF(btrim(COALESCE(s->>'name', CASE WHEN jsonb_typeof(s) = 'string' THEN s #>> '{}' END)), '') IS NOT NULL;--> statement-breakpoint

-- الحزمة الافتراضية (المتطلبات القسم 22) لفئة الدائميين: كلها «مسودة» بالقيم القانونية لا بقيم النظام القديم.
-- التفعيل بعد التحقق والمقابلات، بأمر ومُعتمِد ثانٍ.
INSERT INTO "pay_items" ("code", "name", "direction", "item_group", "classification", "assignment_mode", "method", "category_id", "beneficiary", "created_by")
SELECT v.code, v.name, v.dir, v.grp, v.cls, v.mode, v.method, c.id, v.ben, 'ترحيل B8a1'
FROM payroll_categories c, (VALUES
  ('CERT', 'مخصصات الشهادة والحرفة', '+', 'الشهادة', 'ثابت', 'تلقائي', 'tiered', NULL),
  ('POSITION', 'مخصصات المنصب', '+', 'المنصب', 'تقديري', 'تلقائي', 'tiered', NULL),
  ('GEO', 'مخصصات الموقع الجغرافي', '+', 'الموقع', 'ثابت', 'تلقائي', 'tiered', NULL),
  ('RISK', 'مخصصات الخطورة', '+', 'أخرى', 'تقديري', 'بأمر', 'percent', NULL),
  ('FAMILY', 'مخصصات الإعالة والأطفال', '+', 'العائلية', 'ثابت', 'تلقائي', 'family', NULL),
  ('SPECIAL', 'مخصصات ظروف خاصة', '+', 'أخرى', 'تقديري', 'بأمر', 'percent', NULL),
  ('OVERTIME', 'العمل الإضافي', '+', 'أخرى', 'تقديري', 'بأمر', 'hours', NULL),
  ('MANUAL_DIFF', 'فروقات بأمر (قبل النظام)', '+', 'أخرى', 'مؤقت', 'بأمر', 'manual', NULL),
  ('RETIRE', 'التوقيفات التقاعدية', '-', 'القانونية', 'عام', 'تلقائي', 'percent', 'هيئة التقاعد الوطنية'),
  ('HEALTH', 'الضمان الصحي', '-', 'القانونية', 'عام', 'تلقائي', 'percent', 'هيئة الضمان الصحي'),
  ('TAX', 'ضريبة الدخل', '-', 'القانونية', 'عام', 'تلقائي', 'brackets', 'الهيئة العامة للضرائب'),
  ('PEN_REDUCE', 'إنقاص الراتب (عقوبة)', '-', 'العقوبات', 'مؤقت', 'بأمر', 'percent', NULL),
  ('LOAN', 'السلف والقروض', '-', 'الأقساط', 'مؤقت', 'بأمر', 'installments', NULL),
  ('RECOVER', 'استرداد مبالغ مصروفة', '-', 'الأقساط', 'مؤقت', 'بأمر', 'installments', NULL),
  ('COURT', 'التنفيذ القضائي والنفقة', '-', 'القضائية', 'تقديري', 'بأمر', 'manual', 'المحكمة'),
  ('UNION', 'اشتراك النقابة', '-', 'أخرى', 'تقديري', 'بأمر', 'flat', 'النقابة'),
  ('INSURANCE', 'التأمين', '-', 'أخرى', 'تقديري', 'بأمر', 'flat', 'شركة التأمين')
) AS v(code, name, dir, grp, cls, mode, method, ben)
WHERE c.code = 'PERM';--> statement-breakpoint

-- مقابلة الشهادات بفئات المادة 11 بالاسم (مقترحة؛ تُراجع قبل التفعيل، وغير المطابق يظهر بفحص الجودة)
CREATE OR REPLACE FUNCTION hr_norm_ar(v text) RETURNS text AS $$
  SELECT regexp_replace(translate(btrim(COALESCE(v, '')), 'أإآةى', 'اااهي'), '\s+', ' ', 'g');
$$ LANGUAGE sql IMMUTABLE;--> statement-breakpoint

INSERT INTO "pay_item_versions" ("item_id", "valid_from", "props", "entered_by", "note")
SELECT i.id, '2008-05-12', p.props, 'ترحيل B8a1', 'زرع الحزمة الافتراضية (مسودة)'
FROM pay_items i
JOIN (VALUES
  ('CERT', jsonb_build_object(
     'status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'قانون 22/2008 المادة 11 (أولاً وثانياً)',
     'level_source', 'education_degrees', 'value_kind', 'نسبة', 'base', jsonb_build_array('NOMINAL'),
     'inside_200_cap', true, 'in_retirement_base', false, 'tax_effect', 'خاضع', 'partial_behavior', 'يتبع',
     'calc_order', 10, 'cap_reduction_priority', NULL, 'withholdable', true, 'individual_override', true,
     'levels', COALESCE((SELECT jsonb_agg(jsonb_build_object('ref_id', d.id, 'label', d.name, 'value',
        CASE WHEN hr_norm_ar(d.name) LIKE '%دكتوراه%' THEN 100
             WHEN hr_norm_ar(d.name) LIKE '%ماجستير%' THEN 75
             WHEN hr_norm_ar(d.name) LIKE '%دبلوم عالي%' THEN 55
             WHEN hr_norm_ar(d.name) LIKE '%بكالوريوس%' THEN 45
             WHEN hr_norm_ar(d.name) LIKE '%دبلوم%' THEN 35
             WHEN hr_norm_ar(d.name) LIKE '%اعدادي%' THEN 25
             WHEN hr_norm_ar(d.name) ~ '(متوسط|ابتدائي|يقرا|بدون)' THEN 15 END) ORDER BY d.id)
        FROM education_degrees d
        WHERE hr_norm_ar(d.name) ~ '(دكتوراه|ماجستير|دبلوم|بكالوريوس|اعدادي|متوسط|ابتدائي|يقرا|بدون)'), '[]'::jsonb),
     'notes', 'مقابلة الشهادات مقترحة بالاسم؛ تُراجع قبل التفعيل. ما دون الإعدادية = حرفة 15% (المادة 11/ثانياً)')),
  ('POSITION', jsonb_build_object(
     'status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون 22/2008 المادة 10',
     'level_source', 'responsibility_allowances', 'level_field', 'primary_responsibility', 'value_kind', 'نسبة', 'base', jsonb_build_array('NOMINAL'),
     'inside_200_cap', true, 'in_retirement_base', false, 'tax_effect', 'خاضع', 'partial_behavior', 'يتبع',
     'calc_order', 20, 'cap_reduction_priority', NULL, 'withholdable', true, 'individual_override', true,
     'levels', COALESCE((SELECT jsonb_agg(jsonb_build_object('ref_id', r.id, 'label', r.name, 'value',
        CASE WHEN hr_norm_ar(r.name) = 'معاون مدير عام' THEN 30
             WHEN hr_norm_ar(r.name) LIKE 'مدير قسم%' THEN 20
             WHEN hr_norm_ar(r.name) ~ '^(مسؤول|رئيس) شعبه' THEN 15 END) ORDER BY r.id)
        FROM responsibility_allowances r
        WHERE hr_norm_ar(r.name) = 'معاون مدير عام' OR hr_norm_ar(r.name) LIKE 'مدير قسم%' OR hr_norm_ar(r.name) ~ '^(مسؤول|رئيس) شعبه'), '[]'::jsonb),
     'notes', 'نسب المادة 10: 30 معاون مدير عام، 25 مدير إدارة تشكيل دون مستوى دائرة، 20 مدير قسم، 15 معاون مدير تشكيل ورئيس شعبة. مقابلة مسؤوليات الشركة تُكمل وتُتحقق (ق-5). الوكالة خارجها (ق-4)')),
  ('GEO', jsonb_build_object(
     'status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون 22/2008 المادة 12',
     'level_source', 'work_locations', 'value_kind', 'مبلغ', 'base', jsonb_build_array(),
     'inside_200_cap', true, 'in_retirement_base', false, 'tax_effect', 'خاضع', 'partial_behavior', 'يتبع',
     'calc_order', 30, 'cap_reduction_priority', NULL, 'withholdable', true, 'individual_override', true,
     'conditions', jsonb_build_array(jsonb_build_array(jsonb_build_object('field', 'free_transport', 'op', 'يساوي', 'value', false))),
     'levels', '[]'::jsonb,
     'class_amounts', jsonb_build_object('نائية', 60000, 'ريفية', 50000, 'مركز ناحية', 40000, 'مركز قضاء', 30000, 'مركز محافظة', 20000),
     'notes', 'لكل موقع عمل مبلغ حسب تصنيفه؛ يُستحق لغير المشمولين بالنقل المجاني (ت5). تصنيف المواقع يُدخل')),
  ('RISK', jsonb_build_object('status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون 22/2008 المادة 13', 'value_kind', 'نسبة',
     'base', jsonb_build_array('NOMINAL'), 'caps', jsonb_build_object('min_rate', 20, 'max_rate', 30), 'inside_200_cap', true, 'in_retirement_base', false,
     'tax_effect', 'خاضع', 'partial_behavior', 'يتبع', 'calc_order', 40, 'cap_reduction_priority', NULL, 'withholdable', true, 'individual_override', true)),
  ('FAMILY', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد',
     'legal_basis', 'قانون 22/2008 المادة 14 المعدلة بالقانون 103 لسنة 2012', 'inside_200_cap', false, 'in_retirement_base', false,
     'tax_effect', 'خاضع', 'partial_behavior', 'كامل', 'calc_order', 50, 'withholdable', true, 'individual_override', true,
     'family', jsonb_build_object('spouse_amount', 50000, 'child_amount', 10000, 'max_children', 4, 'son_student_age', 24, 'son_age', 18),
     'notes', 'قاعدة التوزيع إذا الزوجان موظفان يُتحقق منها (ت7)')),
  ('SPECIAL', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'قانون 22/2008 المادة 15', 'value_kind', 'نسبة',
     'base', jsonb_build_array('NOMINAL'), 'caps', jsonb_build_object('max_rate', 50), 'inside_200_cap', false, 'in_retirement_base', false,
     'tax_effect', 'خاضع', 'partial_behavior', 'يتبع', 'calc_order', 60, 'withholdable', true, 'individual_override', true)),
  ('OVERTIME', jsonb_build_object('status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون 22/2008 المادة 17', 'inside_200_cap', false,
     'in_retirement_base', false, 'tax_effect', 'خاضع', 'partial_behavior', 'يتوقف', 'calc_order', 70, 'notes', 'المرحلة B8c')),
  ('MANUAL_DIFF', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'قرار عمر ق-21: فرق يدوي بأمر', 'inside_200_cap', false,
     'in_retirement_base', false, 'tax_effect', 'معفى', 'partial_behavior', 'كامل', 'calc_order', 80, 'allow_negative', true)),
  ('RETIRE', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'قانون التقاعد الموحد 9 لسنة 2014 (ت13)', 'value_kind', 'نسبة',
     'value', 10, 'base', jsonb_build_array('RETIREMENT_BASE'), 'deduction_priority', 0, 'mandatory', true, 'round_line', true,
     'deducted_from_tax_base', true, 'withholdable', true, 'employer_share', NULL,
     'notes', 'حصة الشركة 15% مسودة حتى ق-15 فما تُحتسب ولا تُعرض')),
  ('HEALTH', jsonb_build_object('status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون الضمان الصحي (ت20)', 'value_kind', 'نسبة', 'value', 1,
     'base', jsonb_build_array('NOMINAL'), 'deduction_priority', 0, 'mandatory', true, 'round_line', true, 'notes', 'مسودة حتى كتاب (ق-19)')),
  ('TAX', jsonb_build_object('status', 'مسودة', 'verification', 'يُتحقق', 'legal_basis', 'قانون ضريبة الدخل 113/1982 وتعليمات 1/2007 (ت15)',
     'deduction_priority', 0, 'mandatory', true, 'round_line', true, 'notes', 'مسودة حتى كتاب (ق-10)')),
  ('PEN_REDUCE', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'قانون الانضباط 14/1991 المادة 8', 'value_kind', 'نسبة',
     'base', jsonb_build_array('NOMINAL'), 'caps', jsonb_build_object('max_rate', 10), 'deduction_priority', 2, 'round_line', false)),
  ('LOAN', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'أمر أو عقد', 'deduction_priority', 4, 'round_line', false)),
  ('RECOVER', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'أمر', 'deduction_priority', 3, 'round_line', false)),
  ('COURT', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'حكم قضائي', 'deduction_priority', 1, 'mandatory', true, 'round_line', true)),
  ('UNION', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'طلب أو أمر', 'value_kind', 'مبلغ', 'deduction_priority', 5, 'round_line', true)),
  ('INSURANCE', jsonb_build_object('status', 'مسودة', 'verification', 'مؤكد', 'legal_basis', 'عقد', 'value_kind', 'مبلغ', 'deduction_priority', 5, 'round_line', true))
) AS p(code, props) ON p.code = i.code;
