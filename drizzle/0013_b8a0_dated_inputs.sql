CREATE TABLE "payroll_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "free_transport" boolean;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "risk_exposure" text;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "status" text DEFAULT 'مسودة' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD COLUMN "order_id" integer;--> statement-breakpoint
CREATE INDEX "payroll_audit_entity" ON "payroll_audit" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "payroll_audit_at" ON "payroll_audit" USING btree ("at");--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD CONSTRAINT "salary_scale_versions_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_scale_versions_approved_from" ON "salary_scale_versions" USING btree ("effective_from") WHERE "salary_scale_versions"."status" = 'معتمد';--> statement-breakpoint
-- B8a0: حالات إصدارات السلّم. النافذ اليوم معتمد؛ القديم بلا تاريخ نفاذ مؤرشف؛ الباقي مسودة
-- النافذ بلا تاريخ نفاذ (لا يُتوقع، احتياط): يُعطى تاريخ إنشائه ويُذكر بالملاحظات حتى يُراجع
UPDATE "salary_scale_versions" SET "effective_from" = "created_at"::date,
  "notes" = concat_ws(' — ', "notes", 'B8a0: كان نافذاً بلا تاريخ نفاذ؛ أُعطي تاريخ إنشائه للمراجعة')
  WHERE "is_active" AND "effective_from" IS NULL;--> statement-breakpoint
UPDATE "salary_scale_versions" SET "status" = 'معتمد', "approved_by" = 'ترحيل B8a0', "approved_at" = now() WHERE "is_active";--> statement-breakpoint
-- إصدار كان نافذاً سابقاً ثم استُبدل، أو بلا تاريخ نفاذ: مؤرشف (للاطلاع، ما يتعدل ولا يُحذف)
UPDATE "salary_scale_versions" v SET "status" = 'مؤرشف'
  WHERE v."status" = 'مسودة' AND (v."effective_from" IS NULL OR EXISTS (
    SELECT 1 FROM "activity_logs" l WHERE l."action" = 'تفعيل إصدار سلّم الرواتب' AND btrim(l."details") = btrim(v."name")));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM salary_scale_versions) AND NOT EXISTS (SELECT 1 FROM salary_scale_versions WHERE status = 'معتمد') THEN
    RAISE EXCEPTION 'B8a0: ماكو إصدار سلّم معتمد بعد الترحيل؛ أوقفنا الترقية حتى ما يبقى النظام بلا سلّم';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD CONSTRAINT "salary_scale_versions_status_check" CHECK ("status" IN ('مسودة', 'معتمد', 'مؤرشف'));--> statement-breakpoint
ALTER TABLE "salary_scale_versions" ADD CONSTRAINT "salary_scale_versions_approved_dated" CHECK ("status" <> 'معتمد' OR "effective_from" IS NOT NULL);--> statement-breakpoint

-- خانات الإصدار المعتمد أو المؤرشف ما تتعدل: التغيير إصدار جديد
CREATE OR REPLACE FUNCTION salary_scale_lock() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM salary_scale_versions v
             WHERE v.status <> 'مسودة'
               AND v.id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.version_id END,
                            CASE WHEN TG_OP <> 'DELETE' THEN NEW.version_id END)) THEN
    RAISE EXCEPTION 'إصدار السلّم المعتمد أو المؤرشف ما يتعدل؛ أنشئ إصداراً جديداً (B8a0)' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER salary_scale_lock BEFORE INSERT OR UPDATE OR DELETE ON "salary_scale"
  FOR EACH ROW EXECUTE FUNCTION salary_scale_lock();--> statement-breakpoint

CREATE OR REPLACE FUNCTION salary_scale_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'مسودة' THEN RAISE EXCEPTION 'ما يُحذف إصدار معتمد أو مؤرشف (B8a0)' USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'معتمد' THEN
    IF NEW.status = 'مسودة' THEN RAISE EXCEPTION 'الإصدار المعتمد ما يرجع مسودة (B8a0)' USING ERRCODE = 'P0001'; END IF;
    IF NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
      RAISE EXCEPTION 'تاريخ نفاذ الإصدار المعتمد وأمره ما يتعدلان (B8a0)' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF OLD.status = 'مؤرشف' AND NEW.status <> 'مؤرشف' THEN
    RAISE EXCEPTION 'الإصدار المؤرشف ما يرجع (B8a0)' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER salary_scale_versions_guard BEFORE UPDATE OR DELETE ON "salary_scale_versions"
  FOR EACH ROW EXECUTE FUNCTION salary_scale_versions_guard();--> statement-breakpoint

-- سجل التدقيق إلحاقي فقط
CREATE OR REPLACE FUNCTION payroll_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payroll_audit is append-only (B8a0)';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_audit_append_only BEFORE UPDATE OR DELETE ON "payroll_audit"
  FOR EACH ROW EXECUTE FUNCTION payroll_audit_append_only();--> statement-breakpoint
CREATE TRIGGER payroll_audit_no_truncate BEFORE TRUNCATE ON "payroll_audit"
  FOR EACH STATEMENT EXECUTE FUNCTION payroll_audit_append_only();--> statement-breakpoint

-- تغييرات المستخدمين والأدوار تُسجَّل (قرار B8: خطر المدير الثاني يظهر بتقرير المراجعة)
CREATE OR REPLACE FUNCTION users_audit() RETURNS trigger AS $$
BEGIN
  INSERT INTO payroll_audit (actor, action, entity, entity_id, before, after)
  VALUES (NULLIF(current_setting('hr.user', true), ''),
          CASE TG_OP WHEN 'INSERT' THEN 'إنشاء مستخدم' WHEN 'DELETE' THEN 'حذف مستخدم'
            ELSE CASE WHEN OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.username IS NOT DISTINCT FROM NEW.username
                      THEN 'تغيير كلمة مرور' ELSE 'تعديل مستخدم' END END,
          'users', COALESCE(NEW.id, OLD.id)::text,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'password' END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'password' END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER users_audit_ins_del AFTER INSERT OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_audit();--> statement-breakpoint
CREATE TRIGGER users_audit_upd AFTER UPDATE ON "users"
  FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.username IS DISTINCT FROM NEW.username OR OLD.password IS DISTINCT FROM NEW.password)
  EXECUTE FUNCTION users_audit();--> statement-breakpoint

-- السجل المؤرخ (B8a0): حقول الرواتب، وضع التصحيح، تاريخ نفاذ يمرره الكود، والتقاط الإنشاء
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
                           'org_unit_id','contract_type','free_transport','risk_exposure'] LOOP
    old_v := to_jsonb(OLD) -> f;
    new_v := to_jsonb(NEW) -> f;
    IF old_v IS NOT DISTINCT FROM new_v THEN CONTINUE; END IF;
    IF (old_v IS NULL OR old_v = 'null'::jsonb OR old_v = '""'::jsonb) AND (new_v IS NULL OR new_v = 'null'::jsonb OR new_v = '""'::jsonb) THEN CONTINUE; END IF;

    -- تصحيح خطأ إدخال: يستبدل الصف النافذ اليوم من تاريخه نفسه (ما يولّد مقطعاً)
    IF corr AND (corr_fields IS NULL OR f = ANY(corr_fields)) THEN
      live_id := NULL; live_from := NULL; live_order := NULL;
      SELECT t.id, t.valid_from, t.order_id INTO live_id, live_from, live_order
        FROM employee_field_timeline t
       WHERE t.employee_id = OLD.id AND t.field = f AND (t.valid_from IS NULL OR t.valid_from <= today)
       ORDER BY t.valid_from DESC NULLS LAST, t.recorded_at DESC, t.id DESC
       LIMIT 1;
      -- ماكو صف حي والقيمة القديمة غير فارغة: تُحفظ أساساً أولاً حتى يبقى «ما كان معروفاً» قبل التصحيح
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
$$ LANGUAGE plpgsql;
