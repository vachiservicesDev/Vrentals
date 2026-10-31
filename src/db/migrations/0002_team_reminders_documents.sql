CREATE TABLE IF NOT EXISTS "rentals"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"kind" varchar(12) NOT NULL,
	"name" varchar(200) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"storage_path" text NOT NULL,
	"expires_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD COLUMN "acts_for" uuid;--> statement-breakpoint
ALTER TABLE "rentals"."rent_charges" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals"."rent_charges" ADD COLUMN "late_notice_sent_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."documents" ADD CONSTRAINT "documents_uploaded_by_accounts_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "rentals"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."accounts" ADD CONSTRAINT "accounts_acts_for_accounts_id_fk" FOREIGN KEY ("acts_for") REFERENCES "rentals"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Closed to Supabase's anon/authenticated keys, like every other table here.
ALTER TABLE "rentals"."documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_property_idx" ON "rentals"."documents" ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_acts_for_idx" ON "rentals"."accounts" ("acts_for");--> statement-breakpoint
-- In production the app signs in as rentals_app, which has a policy on every rentals table.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."documents" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
--> statement-breakpoint
-- The private bucket for documents (Supabase only; skipped where there's no Storage, like local tests).
-- Not public and no storage policies: files are reached only through the app's short-lived signed links.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('rentals-documents', 'rentals-documents', false, 26214400, ARRAY[
   'application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'])
  ON CONFLICT (id) DO NOTHING;
 END IF;
END $$;
