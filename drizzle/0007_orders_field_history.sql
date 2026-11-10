CREATE TABLE "administrative_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"order_date" date NOT NULL,
	"issuer" text,
	"subject" text,
	"order_kind" text,
	"effective_date" date,
	"cancels_order_id" integer,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_field_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"field" text NOT NULL,
	"value" jsonb,
	"valid_from" date,
	"order_id" integer,
	"source" text NOT NULL,
	"reason" text,
	"snapshot" jsonb,
	"supersedes_id" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text
);
--> statement-breakpoint
ALTER TABLE "administrative_orders" ADD CONSTRAINT "administrative_orders_cancels_fkey" FOREIGN KEY ("cancels_order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_field_history" ADD CONSTRAINT "employee_field_history_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_field_history" ADD CONSTRAINT "employee_field_history_order_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."administrative_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_field_history" ADD CONSTRAINT "employee_field_history_supersedes_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."employee_field_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_orders_identity" ON "administrative_orders" USING btree ("order_number","order_date",coalesce("issuer", ''));--> statement-breakpoint
CREATE INDEX "employee_field_history_emp_field" ON "employee_field_history" USING btree ("employee_id","field","valid_from");--> statement-breakpoint
CREATE INDEX "employee_field_history_order" ON "employee_field_history" USING btree ("order_id");--> statement-breakpoint
-- B4b: السجل إلحاقي فقط؛ التصحيح صف جديد (supersedes_id) والإلغاء بأمر إلغاء.
CREATE OR REPLACE FUNCTION employee_field_history_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'employee_field_history is append-only (B4b)';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER employee_field_history_no_update_delete
  BEFORE UPDATE OR DELETE ON "employee_field_history"
  FOR EACH ROW EXECUTE FUNCTION employee_field_history_append_only();--> statement-breakpoint
-- الخط الزمني: نهاية كل فترة = يوم قبل بداية الصف الساري التالي لنفس الحقل. يستثني الصفوف
-- المُصحَّحة وصفوف الأوامر الملغاة.
CREATE OR REPLACE VIEW "employee_field_timeline" AS
WITH live AS (
  SELECT h.* FROM "employee_field_history" h
  WHERE h."field" <> 'event'
    AND NOT EXISTS (SELECT 1 FROM "employee_field_history" c WHERE c."supersedes_id" = h."id")
    AND NOT EXISTS (SELECT 1 FROM "administrative_orders" o WHERE o."cancels_order_id" = h."order_id")
)
SELECT live.*,
  (lead("valid_from") OVER w) - 1 AS "valid_to"
FROM live
WINDOW w AS (PARTITION BY "employee_id", "field" ORDER BY "valid_from" NULLS FIRST, "recorded_at", "id");
