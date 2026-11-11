CREATE TABLE "payroll_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"item_id" integer,
	"item_code" text NOT NULL,
	"item_name" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"item_version_id" integer,
	"scale_version_id" integer,
	"assignment_id" integer,
	"segment_from" date,
	"segment_to" date,
	"share" text,
	"base" numeric(18, 6),
	"rate" text,
	"amount" numeric(18, 6) NOT NULL,
	"explain" jsonb
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"kind" text DEFAULT 'عادية' NOT NULL,
	"parent_id" integer,
	"pay_source" text DEFAULT 'ظلّي' NOT NULL,
	"status" text DEFAULT 'مفتوحة' NOT NULL,
	"current_run_id" integer,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"issued_by" text,
	"issued_at" timestamp with time zone,
	"dispatch_letter" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "payroll_results" (
	"run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"computed" boolean NOT NULL,
	"nominal" numeric(18, 6) NOT NULL,
	"allowances" numeric(18, 6) NOT NULL,
	"deductions" numeric(18, 6) NOT NULL,
	"net_exact" numeric(18, 6) NOT NULL,
	"net" numeric(18, 6) NOT NULL,
	"negative" numeric(18, 6) NOT NULL,
	"flags" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"state" text DEFAULT 'جاري' NOT NULL,
	"fingerprint" text,
	"known_at" timestamp with time zone NOT NULL,
	"computed_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"totals" jsonb,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "payroll_variances" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"item_id" integer,
	"item_code" text NOT NULL,
	"item_name" text NOT NULL,
	"before" numeric(18, 6) NOT NULL,
	"after" numeric(18, 6) NOT NULL,
	"cause" text NOT NULL,
	"order_ref" text
);
--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_category_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payroll_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_results" ADD CONSTRAINT "payroll_results_run_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_variances" ADD CONSTRAINT "payroll_variances_run_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_lines_run_emp" ON "payroll_lines" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_periods_regular_key" ON "payroll_periods" USING btree ("category_id","year","month") WHERE kind = 'عادية';--> statement-breakpoint
CREATE INDEX "payroll_periods_status" ON "payroll_periods" USING btree ("category_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_results_run_employee" ON "payroll_results" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_results_employee" ON "payroll_results" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_period" ON "payroll_runs" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "payroll_variances_run" ON "payroll_variances" USING btree ("run_id","employee_id");--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_current_run_fkey" FOREIGN KEY ("current_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_status_check" CHECK ("status" IN ('مفتوحة', 'محتسبة', 'معتمدة', 'مُصدَرة'));--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_kind_check" CHECK ("kind" IN ('عادية', 'استثنائية'));--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_source_check" CHECK ("pay_source" IN ('ظلّي', 'فعلي'));--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_month_check" CHECK ("month" BETWEEN 1 AND 12);--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_state_check" CHECK ("state" IN ('جاري', 'محتسب', 'معتمد', 'مُصدَر', 'ملغى'));--> statement-breakpoint
-- B8a3: الاحتساب ثابت. السطور والنتائج تُدرج فقط والاحتساب «جاري»، والمتغيرات والاحتساب «جاري» أو «محتسب» (عند الاعتماد). لا تعديل ولا حذف أبداً.
CREATE OR REPLACE FUNCTION payroll_run_children_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION '% ثابت: سطور الاحتساب ما تتعدل ولا تُحذف (B8a3)', TG_TABLE_NAME; END IF;
  SELECT state INTO st FROM payroll_runs WHERE id = NEW.run_id;
  IF st = 'جاري' OR (TG_TABLE_NAME = 'payroll_variances' AND st = 'محتسب') THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% الاحتساب % حالته «%»: ما يُضاف له (B8a3)', TG_TABLE_NAME, NEW.run_id, st;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON "payroll_lines" FOR EACH ROW EXECUTE FUNCTION payroll_run_children_guard();--> statement-breakpoint
CREATE TRIGGER payroll_results_guard BEFORE INSERT OR UPDATE OR DELETE ON "payroll_results" FOR EACH ROW EXECUTE FUNCTION payroll_run_children_guard();--> statement-breakpoint
CREATE TRIGGER payroll_variances_guard BEFORE INSERT OR UPDATE OR DELETE ON "payroll_variances" FOR EACH ROW EXECUTE FUNCTION payroll_run_children_guard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_runs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'الاحتساب ما يُحذف؛ يبقى أرشيفاً (B8a3)'; END IF;
  IF NEW.period_id <> OLD.period_id OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint OR NEW.known_at <> OLD.known_at
     OR NEW.computed_by <> OLD.computed_by OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'بيانات الاحتساب الأصلية ما تتعدل (B8a3)';
  END IF;
  IF OLD.state <> 'جاري' AND (NEW.totals IS DISTINCT FROM OLD.totals OR NEW.finished_at IS DISTINCT FROM OLD.finished_at) THEN
    RAISE EXCEPTION 'مجاميع الاحتساب تُثبّت عند انتهائه (B8a3)';
  END IF;
  IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason AND NEW.state <> 'ملغى' THEN RAISE EXCEPTION 'سبب الإلغاء للاحتساب الملغى فقط (B8a3)'; END IF;
  IF NEW.state = OLD.state THEN
    IF OLD.state = 'جاري' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'الاحتساب «%» ما يتعدل (B8a3)', OLD.state;
  END IF;
  IF (OLD.state, NEW.state) IN (('جاري', 'محتسب'), ('محتسب', 'معتمد'), ('محتسب', 'ملغى'), ('معتمد', 'مُصدَر'), ('معتمد', 'ملغى')) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'انتقال غير مسموح للاحتساب: % ← % (B8a3)', OLD.state, NEW.state;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_runs_guard BEFORE UPDATE OR DELETE ON "payroll_runs" FOR EACH ROW EXECUTE FUNCTION payroll_runs_guard();--> statement-breakpoint
-- انتقالات الفترة (س11.1): فتح ← احتساب ← اعتماد ← إصدار، وإلغاء الاعتماد يرجعها مفتوحة. المُصدَرة ما تتعدل.
-- الاحتساب الحالي لازم من نفس الفترة وحالته تطابق حالة الفترة؛ أعمدة الاعتماد والإصدار تتغير بانتقالها فقط.
CREATE OR REPLACE FUNCTION payroll_periods_guard() RETURNS trigger AS $$
DECLARE r record; want text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'الفترة ما تُحذف (B8a3)'; END IF;
  IF OLD.status = 'مُصدَرة' THEN RAISE EXCEPTION 'الفترة المُصدَرة ما تتعدل؛ أي تصحيح فرق رجعي (س11.3)'; END IF;
  IF NEW.category_id <> OLD.category_id OR NEW.year <> OLD.year OR NEW.month <> OLD.month OR NEW.kind <> OLD.kind
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.pay_source <> OLD.pay_source OR NEW.opened_by <> OLD.opened_by OR NEW.opened_at <> OLD.opened_at THEN
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
CREATE TRIGGER payroll_periods_guard BEFORE UPDATE OR DELETE ON "payroll_periods" FOR EACH ROW EXECUTE FUNCTION payroll_periods_guard();--> statement-breakpoint
-- الاحتساب يولد «جاري» بلا مجاميع، والفترة الجديدة «مفتوحة»
CREATE OR REPLACE FUNCTION payroll_runs_birth_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.state <> 'جاري' OR NEW.totals IS NOT NULL OR NEW.finished_at IS NOT NULL OR NEW.cancel_reason IS NOT NULL THEN
    RAISE EXCEPTION 'الاحتساب يبدأ «جاري» بلا مجاميع (B8a3)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_periods_birth_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'مفتوحة' OR NEW.current_run_id IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.issued_by IS NOT NULL THEN
    RAISE EXCEPTION 'الفترة تبدأ «مفتوحة» (B8a3)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_runs_birth BEFORE INSERT ON "payroll_runs" FOR EACH ROW EXECUTE FUNCTION payroll_runs_birth_guard();--> statement-breakpoint
CREATE TRIGGER payroll_periods_birth BEFORE INSERT ON "payroll_periods" FOR EACH ROW EXECUTE FUNCTION payroll_periods_birth_guard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_no_truncate() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% ثابت: ما يُفرَّغ (B8a3)', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payroll_lines_no_truncate BEFORE TRUNCATE ON "payroll_lines" FOR EACH STATEMENT EXECUTE FUNCTION payroll_no_truncate();--> statement-breakpoint
CREATE TRIGGER payroll_results_no_truncate BEFORE TRUNCATE ON "payroll_results" FOR EACH STATEMENT EXECUTE FUNCTION payroll_no_truncate();--> statement-breakpoint
CREATE TRIGGER payroll_variances_no_truncate BEFORE TRUNCATE ON "payroll_variances" FOR EACH STATEMENT EXECUTE FUNCTION payroll_no_truncate();--> statement-breakpoint
CREATE TRIGGER payroll_runs_no_truncate BEFORE TRUNCATE ON "payroll_runs" FOR EACH STATEMENT EXECUTE FUNCTION payroll_no_truncate();--> statement-breakpoint
CREATE TRIGGER payroll_periods_no_truncate BEFORE TRUNCATE ON "payroll_periods" FOR EACH STATEMENT EXECUTE FUNCTION payroll_no_truncate();
