CREATE TABLE "request_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"role" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer,
	"ip" text,
	"body" jsonb
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"name" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"base" text NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_audit_at" ON "request_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "request_audit_user" ON "request_audit" USING btree ("username","at");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_base_check" CHECK ("base" IN ('admin', 'user', 'employee'));--> statement-breakpoint
-- الأدوار الافتراضية = السلوك قبل B9 تماماً
INSERT INTO "roles" ("name", "label", "base", "permissions", "is_system") VALUES
  ('admin', 'مدير النظام', 'admin', ARRAY['payroll.view', 'payroll.enter', 'payroll.approve', 'payroll.settings', 'users.manage', 'audit.view'], true),
  ('user', 'مستخدم إدخال', 'user', ARRAY['payroll.view', 'payroll.enter'], true),
  ('hr', 'موارد بشرية', 'user', ARRAY['payroll.view', 'payroll.enter'], true),
  ('employee', 'اطلاع', 'employee', ARRAY[]::text[], true)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- مستخدمون بأدوار غير معروفة سابقاً يُحفظ دورهم كما هو؛ الخادم يعاملهم «اطلاع» حتى يُعرَّف الدور
-- تعديل الأدوار حساس (من يعتمد الرواتب): سجل تدقيق
CREATE OR REPLACE FUNCTION roles_audit() RETURNS trigger AS $$
BEGIN
  INSERT INTO payroll_audit (actor, action, entity, entity_id, before, after)
  VALUES (coalesce(current_setting('hr.user', true), 'قاعدة البيانات'), lower(TG_OP), 'roles', coalesce(NEW.name, OLD.name),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN coalesce(NEW, OLD);
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER roles_audit AFTER INSERT OR UPDATE OR DELETE ON "roles" FOR EACH ROW EXECUTE FUNCTION roles_audit();--> statement-breakpoint
-- الدور النظامي admin يبقى بكل الصلاحيات وما يُحذف (حتى ما يُقفل النظام)
CREATE OR REPLACE FUNCTION roles_protect_admin() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN RAISE EXCEPTION 'الأدوار النظامية ما تُحذف (B9)'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.name = 'admin' AND (NEW.base <> 'admin' OR NOT (NEW.permissions @> ARRAY['users.manage', 'payroll.approve', 'audit.view'])) THEN
    RAISE EXCEPTION 'دور المدير يبقى بأساس admin وصلاحية إدارة المستخدمين (B9)';
  END IF;
  IF NEW.name <> OLD.name OR NEW.is_system <> OLD.is_system THEN RAISE EXCEPTION 'اسم الدور ونوعه ثابتان (B9)'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER roles_protect_admin BEFORE UPDATE OR DELETE ON "roles" FOR EACH ROW EXECUTE FUNCTION roles_protect_admin();--> statement-breakpoint
CREATE OR REPLACE FUNCTION request_audit_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'سجل التدقيق إلحاقي: ما يُعدَّل ولا يُحذف (B9)'; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER request_audit_append_only BEFORE UPDATE OR DELETE ON "request_audit" FOR EACH ROW EXECUTE FUNCTION request_audit_append_only();--> statement-breakpoint
CREATE TRIGGER request_audit_no_truncate BEFORE TRUNCATE ON "request_audit" FOR EACH STATEMENT EXECUTE FUNCTION request_audit_append_only();
