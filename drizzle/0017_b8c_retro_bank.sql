CREATE TABLE "employee_bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"valid_from" date NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"entered_by" text NOT NULL,
	"approved_by" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "payroll_bank_rejections" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"reason" text NOT NULL,
	"entered_by" text NOT NULL,
	"approved_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pay_items" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD COLUMN "employee_ids" integer[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employee_id" integer;--> statement-breakpoint
CREATE INDEX "employee_bank_accounts_emp" ON "employee_bank_accounts" USING btree ("employee_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_bank_rejections_run_emp" ON "payroll_bank_rejections" USING btree ("run_id","employee_id");
--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_emp_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "payroll_bank_rejections" ADD CONSTRAINT "payroll_bank_rejections_run_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_exceptional_check" CHECK (("kind" = 'استثنائية') = ("employee_ids" IS NOT NULL AND cardinality("employee_ids") > 0));--> statement-breakpoint
-- الحساب المصرفي: يُستبدل ولا يُعدَّل (superseded_at فقط)، ولا يُحذف
CREATE OR REPLACE FUNCTION bank_accounts_supersede_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'الحساب المصرفي ما يُحذف؛ يُستبدل (B8c)'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'الحساب المصرفي يُستبدل بسجل جديد فقط (B8c)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER bank_accounts_supersede_only BEFORE UPDATE OR DELETE ON "employee_bank_accounts" FOR EACH ROW EXECUTE FUNCTION bank_accounts_supersede_only();--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_rejections_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'رفض المصرف سجل ثابت (B8c)'; END IF;
  SELECT state INTO st FROM payroll_runs WHERE id = NEW.run_id;
  IF st IS DISTINCT FROM 'مُصدَر' THEN RAISE EXCEPTION 'رفض المصرف لاحتساب مُصدَر فقط (B8c)'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER bank_rejections_guard BEFORE INSERT OR UPDATE OR DELETE ON "payroll_bank_rejections" FOR EACH ROW EXECUTE FUNCTION bank_rejections_guard();--> statement-breakpoint
-- هوية الفترة تشمل موظفي الدورة الاستثنائية
CREATE OR REPLACE FUNCTION payroll_periods_guard() RETURNS trigger AS $$
DECLARE r record; want text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'الفترة ما تُحذف (B8a3)'; END IF;
  IF OLD.status = 'مُصدَرة' THEN RAISE EXCEPTION 'الفترة المُصدَرة ما تتعدل؛ أي تصحيح فرق رجعي (س11.3)'; END IF;
  IF NEW.category_id <> OLD.category_id OR NEW.year <> OLD.year OR NEW.month <> OLD.month OR NEW.kind <> OLD.kind
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.employee_ids IS DISTINCT FROM OLD.employee_ids OR NEW.pay_source <> OLD.pay_source OR NEW.opened_by <> OLD.opened_by OR NEW.opened_at <> OLD.opened_at THEN
    RAISE EXCEPTION 'هوية الفترة ما تتعدل (B8a3)';
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status, NEW.status) IN (('مفتوحة', 'محتسبة'), ('محتسبة', 'معتمدة'), ('معتمدة', 'مُصدَرة'), ('معتمدة', 'مفتوحة'))) THEN
    RAISE EXCEPTION 'انتقال غير مسموح للفترة: % ← % (س11.1)', OLD.status, NEW.status;
  END IF;
  IF NEW.status = OLD.status AND NEW.status <> 'محتسبة' AND NEW.current_run_id IS DISTINCT FROM OLD.current_run_id THEN
    RAISE EXCEPTION 'تغيير الاحتساب الحالي للفترة المحتسبة فقط (B8a3)';
  END IF;
  IF (OLD.status, NEW.status) IN (('محتسبة', 'معتمدة'), ('معتمدة', 'مُصدَرة')) AND NEW.current_run_id IS DISTINCT FROM OLD.current_run_id THEN
    RAISE EXCEPTION 'الاعتماد والإصدار على الاحتساب الحالي نفسه (B8a3)';
  END IF;
  IF (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)
     AND (OLD.status, NEW.status) NOT IN (('محتسبة', 'معتمدة'), ('معتمدة', 'مفتوحة')) THEN
    RAISE EXCEPTION 'بيانات الاعتماد تتغير عند الاعتماد أو إلغائه فقط (B8a3)';
  END IF;
  IF (NEW.issued_by IS DISTINCT FROM OLD.issued_by OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.dispatch_letter IS DISTINCT FROM OLD.dispatch_letter)
     AND (OLD.status, NEW.status) <> ('معتمدة', 'مُصدَرة') THEN
    RAISE EXCEPTION 'بيانات الإصدار تتغير عند الإصدار فقط (B8a3)';
  END IF;
  IF NEW.status = 'مفتوحة' THEN
    IF NEW.current_run_id IS NOT NULL THEN RAISE EXCEPTION 'الفترة المفتوحة بلا احتساب حالي (B8a3)'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.current_run_id IS NULL THEN RAISE EXCEPTION 'الفترة % بلا احتساب (B8a3)', NEW.status; END IF;
  SELECT period_id, state INTO r FROM payroll_runs WHERE id = NEW.current_run_id;
  want := CASE NEW.status WHEN 'محتسبة' THEN 'محتسب' WHEN 'معتمدة' THEN 'معتمد' ELSE 'مُصدَر' END;
  IF r.period_id IS DISTINCT FROM NEW.id OR r.state IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'الاحتساب % مو من هذه الفترة أو حالته «%» لا تطابق «%» (B8a3)', NEW.current_run_id, r.state, NEW.status;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
-- تغيير ربط المستخدم بموظف حساس (س15.3): سجل تدقيق
CREATE OR REPLACE FUNCTION users_employee_link_audit() RETURNS trigger AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    INSERT INTO payroll_audit (actor, action, entity, entity_id, before, after)
    VALUES (coalesce(current_setting('hr.user', true), 'قاعدة البيانات'), 'ربط مستخدم بموظف', 'users', NEW.id::text,
      jsonb_build_object('username', OLD.username, 'employee_id', OLD.employee_id), jsonb_build_object('username', NEW.username, 'employee_id', NEW.employee_id));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER users_employee_link_audit AFTER UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION users_employee_link_audit();
--> statement-breakpoint
ALTER TABLE "payroll_categories" ADD COLUMN "payroll_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- كشف المتأثرين بالأثر الرجعي يحتاج وقت آخر تعديل للإجازة والعقوبة (تغيير الحالة أو التواريخ ما يغيّر created_at)
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "penalties" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER leave_requests_touch BEFORE UPDATE ON "leave_requests" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint
CREATE TRIGGER penalties_touch BEFORE UPDATE ON "penalties" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- كشف المتأثرين بالأثر الرجعي يبحث بزمن التسجيل
CREATE INDEX IF NOT EXISTS "employee_field_history_recorded" ON "employee_field_history" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_pay_assignments_recorded" ON "employee_pay_assignments" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_audit_at" ON "payroll_audit" USING btree ("at");
