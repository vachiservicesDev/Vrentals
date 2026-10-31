CREATE TABLE IF NOT EXISTS "rentals"."platform_admins" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD COLUMN "home_limit" integer;--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD COLUMN "plan_expires" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."platform_admins" ADD CONSTRAINT "platform_admins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "rentals"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "rentals"."platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."platform_admins" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
