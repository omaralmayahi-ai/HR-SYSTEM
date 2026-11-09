CREATE TABLE "app_settings_documents" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'user',
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
